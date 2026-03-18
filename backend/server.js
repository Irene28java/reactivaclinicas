require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const http       = require("http");
const jwt        = require("jsonwebtoken");
const rateLimit  = require("express-rate-limit");
const { Server } = require("socket.io");
const nodemailer = require("nodemailer");
const db         = require("./database");

// ─────────────────────────────────────────────
// SERVICES
// ─────────────────────────────────────────────
const { generarHorariosDia, generarHorarios30Dias } = require("./services/horariosGenerator");
const { reservarCita }      = require("./services/reservarCita");
const { listenEmails }      = require("./services/gmailListener");
const { iniciarRecordatorios } = require("./services/recordatorios");

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────
const leadsRoutes     = require("./routes/leads");
const authRoutes      = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const pagosRouter     = require("./routes/payments");

// Webhook con bot multicanal + procesarRecordatorios exportado
const webhookRoutes           = require("./routes/webhook");
const { procesarRecordatorios } = require("./routes/webhook");

const app    = express();
const server = http.createServer(app);
const JWT_SECRET = process.env.JWT_SECRET || "reactiva_secret";

// ─────────────────────────────────────────────
// BODY PARSER
// Webhook de Meta necesita raw antes que json()
// ─────────────────────────────────────────────
app.use((req, res, next) => {
    if (req.path.startsWith("/webhook")) {
        express.raw({ type: "*/*" })(req, res, () => {
            try { req.body = JSON.parse(req.body.toString()); } catch { req.body = {}; }
            next();
        });
    } else {
        express.json()(req, res, next);
    }
});
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || "*").split(",").map(o => o.trim());
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin))
            callback(null, true);
        else
            callback(new Error("CORS bloqueado: " + origin));
    },
    credentials: true
}));

// ─────────────────────────────────────────────
// SOCKET.IO
// ─────────────────────────────────────────────
const io = new Server(server, {
    cors: { origin: allowedOrigins.includes("*") ? "*" : allowedOrigins }
});

io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next();
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user   = decoded;
        next();
    } catch (err) {
        next(new Error("Auth error"));
    }
});

io.on("connection", (socket) => {
    console.log("🔌 Cliente conectado:", socket.id);
    socket.on("join_clinic", clinicId => {
        socket.join("clinic_" + clinicId);
        console.log(`   ↳ Unido a clinic_${clinicId}`);
    });
    socket.on("disconnect", () => console.log("🔌 Cliente desconectado:", socket.id));
});

app.set("io", io);

// ─────────────────────────────────────────────
// EMAIL — nodemailer (Gmail)
// ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function sendEmail(to, text, subject = "ReActiva") {
    if (!process.env.EMAIL_USER) return;
    transporter.sendMail({
        from   : `"ReActiva Clínicas" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html   : `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:30px">
                    <h2 style="color:#00e676;margin-bottom:16px">${subject}</h2>
                    <p style="white-space:pre-line;color:#333;line-height:1.7">${text}</p>
                    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
                    <p style="font-size:12px;color:#999">ReActiva Clínicas · Sistema automatizado de gestión</p>
                  </div>`
    }).then(() => {
        console.log(`📧 Email → ${to} | ${subject}`);
    }).catch(err => {
        console.error("❌ Error email:", err.message);
    });
}

// Exponer sendEmail para que el webhook y otros servicios lo usen
app.set("sendEmail", sendEmail);

// ─────────────────────────────────────────────
// MIDDLEWARE AUTH
// ─────────────────────────────────────────────
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token      = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Token requerido" });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(403).json({ error: "Token inválido" });
    }
}

// ─────────────────────────────────────────────
// OTP LOGIN (sin contraseña)
// ─────────────────────────────────────────────
const otpStore    = {};
const otpRequests = {};
const otpLimiter  = rateLimit({ windowMs: 60_000, max: 5 });

function generarOTP() {
    return Math.floor(100_000 + Math.random() * 900_000).toString();
}

app.post("/api/request-otp", otpLimiter, (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email requerido" });

    const now = Date.now();
    if (otpRequests[email] && now - otpRequests[email] < 60_000)
        return res.status(429).json({ error: "Espera 1 minuto antes de solicitar otro código" });

    const code = generarOTP();
    otpStore[email]    = { code, expires: now + 15 * 60_000 };
    otpRequests[email] = now;

    sendEmail(
        email,
        `Tu código de acceso es: <b style="font-size:28px;letter-spacing:6px">${code}</b><br><br>Válido durante 15 minutos.`,
        "Tu código de acceso ReActiva"
    );

    res.json({ success: true });
});

app.post("/api/verify-otp", (req, res) => {
    const { email, code } = req.body;
    const record = otpStore[email];
    if (!record)                   return res.status(400).json({ error: "OTP inválido o expirado" });
    if (record.code !== code)      return res.status(400).json({ error: "Código incorrecto" });
    if (Date.now() > record.expires) return res.status(400).json({ error: "Código expirado" });

    delete otpStore[email];

    db.get(`SELECT * FROM users WHERE email=?`, [email], (err, user) => {
        if (err)   return res.status(500).json({ error: "Error de base de datos" });
        if (!user) return res.status(404).json({ error: "No existe una cuenta con ese email" });

        const token = jwt.sign(
            { id: user.id, email: user.email, plan: user.plan, clinic_name: user.clinic_name },
            JWT_SECRET,
            { expiresIn: "7d" }
        );
        res.json({ token });
    });
});

// ─────────────────────────────────────────────
// RUTAS PRINCIPALES
// ─────────────────────────────────────────────
app.use("/api/leads",     leadsRoutes);
app.use("/api/auth",      authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/pagos",     pagosRouter);

// Webhook Meta (FB/IG) — debe ir ANTES de otras rutas /webhook
// La URL que metes en Meta Developer Console:
//   https://TU-APP.up.railway.app/webhook
app.use("/webhook", webhookRoutes);

// ─────────────────────────────────────────────
// API HORARIOS
// ─────────────────────────────────────────────

// GET /api/horarios?fecha=YYYY-MM-DD
// Sin fecha → devuelve todos los futuros
app.get("/api/horarios", authenticateToken, (req, res) => {
    const { fecha } = req.query;
    const clinicId  = req.user.id;

    const q = fecha
        ? `SELECT * FROM horarios WHERE clinic_id=? AND fecha=? ORDER BY hora ASC`
        : `SELECT * FROM horarios WHERE clinic_id=? AND fecha>=date('now') ORDER BY fecha ASC, hora ASC`;
    const params = fecha ? [clinicId, fecha] : [clinicId];

    db.all(q, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// POST /api/horarios — crear un slot
app.post("/api/horarios", authenticateToken, (req, res) => {
    const { fecha, hora } = req.body;
    const clinicId        = req.user.id;

    if (!fecha || !hora)
        return res.status(400).json({ error: "fecha y hora son obligatorios" });

    db.run(
        `INSERT OR IGNORE INTO horarios (clinic_id, fecha, hora, disponible) VALUES (?,?,?,1)`,
        [clinicId, fecha, hora],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, clinic_id: clinicId, fecha, hora, disponible: 1 });
        }
    );
});

// DELETE /api/horarios/:id — eliminar slot
app.delete("/api/horarios/:id", authenticateToken, (req, res) => {
    db.run(
        `DELETE FROM horarios WHERE id=? AND clinic_id=?`,
        [req.params.id, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: "Slot no encontrado" });
            res.json({ deleted: true });
        }
    );
});

// PATCH /api/horarios/:id/disponible — marcar libre/ocupado manualmente
app.patch("/api/horarios/:id/disponible", authenticateToken, (req, res) => {
    const { disponible } = req.body; // 0 o 1
    db.run(
        `UPDATE horarios SET disponible=? WHERE id=? AND clinic_id=?`,
        [disponible ? 1 : 0, req.params.id, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: "Slot no encontrado" });
            res.json({ updated: true, disponible: disponible ? 1 : 0 });
        }
    );
});

// ─────────────────────────────────────────────
// API CITAS
// ─────────────────────────────────────────────

// GET /api/citas?fecha=YYYY-MM-DD&status=pendiente
app.get("/api/citas", authenticateToken, (req, res) => {
    const { fecha, status } = req.query;
    const clinicId          = req.user.id;

    let q      = `SELECT * FROM citas WHERE clinic_id=?`;
    let params = [clinicId];

    if (fecha)  { q += ` AND fecha=?`;  params.push(fecha); }
    if (status) { q += ` AND status=?`; params.push(status); }
    q += ` ORDER BY fecha ASC, hora ASC`;

    db.all(q, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// POST /api/citas — crear cita manualmente (desde el dashboard)
app.post("/api/citas", authenticateToken, (req, res) => {
    const { name, phone, servicio, fecha, hora, notas, canal } = req.body;
    const clinicId = req.user.id;

    if (!fecha || !hora || !name)
        return res.status(400).json({ error: "name, fecha y hora son obligatorios" });

    const ts = new Date().toISOString();

    db.run(
        `INSERT OR IGNORE INTO citas
         (clinic_id, name, phone, servicio, fecha, hora, status, canal, created_at)
         VALUES (?,?,?,?,?,?,'pendiente',?,?)`,
        [clinicId, name, phone||"", servicio||"", fecha, hora, canal||"web", ts],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.lastID) {
                // Marcar slot como ocupado
                db.run(
                    `UPDATE horarios SET disponible=0
                     WHERE clinic_id=? AND fecha=? AND hora=? AND disponible=1`,
                    [clinicId, fecha, hora]
                );
                // Emitir por socket
                const io = req.app.get("io");
                if (io) io.to(`clinic_${clinicId}`).emit("new_cita", { id: this.lastID, name, phone, servicio, fecha, hora, canal: canal||"web", status: "pendiente" });
            }
            res.json({ id: this.lastID, name, phone, servicio, fecha, hora, status: "pendiente" });
        }
    );
});

// PUT /api/citas/:id/status — cambiar estado
app.put("/api/citas/:id/status", authenticateToken, (req, res) => {
    const { status } = req.body;
    const allowed     = ["pendiente","confirmada","cancelada","completada"];
    if (!allowed.includes(status))
        return res.status(400).json({ error: "Estado no válido. Usa: " + allowed.join("|") });

    const clinicId = req.user.id;
    const citaId   = req.params.id;

    db.run(
        `UPDATE citas SET status=? WHERE id=? AND clinic_id=?`,
        [status, citaId, clinicId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: "Cita no encontrada" });

            // Si se cancela → liberar el slot de horarios
            if (status === "cancelada") {
                db.get(`SELECT fecha, hora FROM citas WHERE id=?`, [citaId], (err2, cita) => {
                    if (!err2 && cita) {
                        db.run(
                            `UPDATE horarios SET disponible=1
                             WHERE clinic_id=? AND fecha=? AND hora=?`,
                            [clinicId, cita.fecha, cita.hora]
                        );
                    }
                });
            }

            res.json({ updated: true, status });
        }
    );
});

// DELETE /api/citas/:id — eliminar cita definitivamente
app.delete("/api/citas/:id", authenticateToken, (req, res) => {
    const clinicId = req.user.id;
    const citaId   = req.params.id;

    // Primero recuperar fecha/hora para liberar el slot
    db.get(`SELECT fecha, hora FROM citas WHERE id=? AND clinic_id=?`, [citaId, clinicId], (err, cita) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!cita) return res.status(404).json({ error: "Cita no encontrada" });

        db.run(`DELETE FROM citas WHERE id=? AND clinic_id=?`, [citaId, clinicId], function(err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            // Liberar slot
            db.run(
                `UPDATE horarios SET disponible=1
                 WHERE clinic_id=? AND fecha=? AND hora=?`,
                [clinicId, cita.fecha, cita.hora]
            );
            res.json({ deleted: true });
        });
    });
});

// ─────────────────────────────────────────────
// CHAT WEB (widget en la web del cliente)
// ─────────────────────────────────────────────
app.post("/api/chat", (req, res) => {
    const { message, sessionId, canal, clinicId } = req.body;
    if (!message || !sessionId) return res.status(400).json({ error: "Faltan datos" });

    const clinicaId = parseInt(clinicId) || 1;

    // Resolución de clínica por clinicId directo
    db.get(`SELECT id, clinic_name, tipo_clinica FROM users WHERE id=?`, [clinicaId], (err, user) => {
        const clinica = {
            clinicId : user ? user.id : clinicaId,
            tipo     : user ? (user.tipo_clinica || "dental") : "dental",
            nombre   : user ? user.clinic_name : "Clínica"
        };

        const { procesarMensaje } = require("./routes/webhook");
        procesarMensaje(req, sessionId, message, canal || "web", clinica, (reply) => {
            res.json({ reply });
        });
    });
});

// ─────────────────────────────────────────────
// HEALTHCHECK
// ─────────────────────────────────────────────
app.get("/",       (req, res) => res.json({ status: "ok", service: "ReActiva API" }));
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// ─────────────────────────────────────────────
// INICIAR SERVICIOS
// ─────────────────────────────────────────────
listenEmails(app);       // Gmail listener
iniciarRecordatorios();  // Recordatorios internos del servicio (si existe la lógica ahí)

// Generar horarios 30 días para todas las clínicas
db.all("SELECT id FROM users", [], (err, rows) => {
    if (!err && rows) {
        rows.forEach(c => {
            try { generarHorarios30Dias(c.id); } catch(e) { /* servicio opcional */ }
        });
    }
});

// ─────────────────────────────────────────────
// CRON: RECORDATORIOS 24h — webhook.js los envía
// Revisa cada hora si hay citas para mañana sin aviso
// ─────────────────────────────────────────────
const HORA_MS = 60 * 60 * 1000;

function ejecutarRecordatorios() {
    console.log("⏰ Verificando recordatorios de citas...");
    try { procesarRecordatorios(app); } catch(e) { console.error("Error recordatorios:", e.message); }
}

setInterval(ejecutarRecordatorios, HORA_MS);
setTimeout(ejecutarRecordatorios, 8_000); // ejecutar 8s después de arrancar

// ─────────────────────────────────────────────
// CRON: SUSCRIPCIONES — downgrade si llevan >30 días sin renovar
// ─────────────────────────────────────────────
function checkSubscriptions() {
    db.all(`SELECT * FROM users WHERE plan_status='active'`, [], (err, users) => {
        if (err || !users) return;
        users.forEach(user => {
            const start    = new Date(user.plan_started_at);
            const diffDays = (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24);
            if (diffDays > 30) {
                db.run(`UPDATE users SET plan_status='inactive', plan='BASIC' WHERE id=?`, [user.id]);
                console.log(`⚠️  Usuario ${user.id} (${user.email}) — downgrade por falta de pago`);
            }
        });
    });
}

setInterval(checkSubscriptions, HORA_MS);

// ─────────────────────────────────────────────
// ERROR GLOBAL
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error("❌ Server error:", err.message || err);
    res.status(500).json({ error: "Internal server error" });
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log("");
    console.log("🚀 ════════════════════════════════════");
    console.log(`   ReActiva API — Puerto ${PORT}`);
    console.log("════════════════════════════════════════");
    console.log("📧 Gmail listener       →  activo");
    console.log("📅 Sistema de horarios  →  activo");
    console.log("🔔 Recordatorios 24h    →  activo (cada hora)");
    console.log("🤖 Webhook FB/IG        →  /webhook");
    console.log("💬 Chat web             →  /api/chat");
    console.log("════════════════════════════════════════");
    console.log("");
});