require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const { Server } = require("socket.io");
const nodemailer = require("nodemailer");
const db         = require('./database');

const authRoutes    = require('./routes/auth');
const leadsRoutes   = require('./routes/leads');
const authMiddleware = require('./middleware/auth');
const webhookRoutes  = require('./routes/webhook');   // ← NUEVO

const app    = express();
const server = http.createServer(app);

// ══════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════

// ─── CAMBIO: el webhook de Meta necesita body sin parsear ───
app.use((req, res, next) => {
    if (req.path === '/webhook') {
        express.raw({ type: '*/*' })(req, res, () => {
            if (Buffer.isBuffer(req.body)) {
                try { req.body = JSON.parse(req.body.toString()); }
                catch(e) { req.body = {}; }
            }
            next();
        });
    } else {
        express.json()(req, res, next);
    }
});
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = (process.env.FRONTEND_URL || "*").split(",").map(o => o.trim());
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("CORS: origen no permitido → " + origin));
        }
    },
    credentials: true
}));

// ══════════════════════════════════════════════
// SOCKET.IO  — notificaciones en tiempo real
// ══════════════════════════════════════════════
const io = new Server(server, {
    cors: {
        origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    console.log("🔌 Cliente conectado:", socket.id);

    socket.on("join_clinic", (clinic_id) => {
        socket.join(`clinic_${clinic_id}`);
        console.log(`Dashboard clínica ${clinic_id} conectado`);
    });

    socket.on("disconnect", () => console.log("🔌 Cliente desconectado:", socket.id));
});

app.set("io", io);

// ══════════════════════════════════════════════
// EMAIL  — nodemailer
// ══════════════════════════════════════════════
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function sendEmail(to, text, subject = "Nuevo lead en ReActiva") {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
    transporter.sendMail({
        from: `"ReActiva Clínicas" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
        html: `<div style="font-family:sans-serif;padding:20px;background:#f5f5f5">
          <div style="background:white;border-radius:12px;padding:24px;max-width:480px;margin:0 auto">
            <h2 style="color:#00b248;margin-bottom:16px">📩 ${subject}</h2>
            <pre style="background:#f9f9f9;padding:16px;border-radius:8px;font-size:14px">${text}</pre>
            <a href="${process.env.FRONTEND_URL || 'https://reactiva.app'}/dashboard.html"
               style="display:inline-block;margin-top:20px;padding:12px 24px;background:#00e676;color:#07090d;border-radius:8px;font-weight:700;text-decoration:none">
              Ver en dashboard →
            </a>
          </div>
        </div>`
    }).catch(err => console.error("Email error:", err.message));
}

app.set("sendEmail", sendEmail);

// ══════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════
app.use("/api/auth",  authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/webhook",   webhookRoutes);   // ← NUEVO

app.get("/", (req, res) => res.json({ status: "ok", service: "ReActiva API", version: "1.0.0" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ══════════════════════════════════════════════
// DASHBOARD MÉTRICAS
// ══════════════════════════════════════════════
app.get('/api/dashboard', authMiddleware, (req, res) => {
    const clinicId = req.user.id;

    db.all(`SELECT * FROM leads WHERE clinic_id=?`, [clinicId], (err, leads) => {
        if (err) return res.status(500).json({ error: "Error cargando leads" });

        db.all(`SELECT * FROM pagos WHERE clinic_id=?`, [clinicId], (err, pagos) => {
            if (err) return res.status(500).json({ error: "Error cargando pagos" });

            const totalLeads     = leads.length;
            const converted      = leads.filter(l => l.status === "closed").length;
            const conversionRate = totalLeads > 0
                ? parseFloat((converted / totalLeads * 100).toFixed(1))
                : 0;
            const totalRevenue   = pagos.reduce((acc, p) => acc + (p.amount || 0), 0);

            const hoy   = new Date();
            const byDay = Array(7).fill(0);
            leads.forEach(l => {
                const d    = new Date(l.timestamp);
                const diff = Math.floor((hoy - d) / 86400000);
                if (diff >= 0 && diff < 7) byDay[6 - diff]++;
            });

            // ─── Desglose por canal ───────────────
            const porCanal = { web: 0, facebook: 0, instagram: 0 };
            leads.forEach(l => {
                const c = l.canal || "web";
                porCanal[c] = (porCanal[c] || 0) + 1;
            });

            res.json({
                totalLeads,
                converted,
                conversionRate,
                totalRevenue,
                byDay,
                porCanal,                                    // ← NUEVO
                newLeads: leads.filter(l => l.status === "new").length
            });
        });
    });
});

// ══════════════════════════════════════════════
// PAGO / PLAN
// ══════════════════════════════════════════════
app.post('/api/payment', authMiddleware, (req, res) => {
    const clinicId = req.user.id;
    const { paypal_order_id, plan, amount } = req.body;

    if (!paypal_order_id) return res.status(400).json({ error: "paypal_order_id requerido" });

    const planName   = plan   || "premium";
    const planAmount = amount || 500;

    db.run(
        `INSERT INTO pagos (clinic_id,email,amount,plan,paypal_order_id,created_at) VALUES (?,?,?,?,?,?)`,
        [clinicId, req.user.email || "", planAmount, planName, paypal_order_id, new Date().toISOString()],
        function(err) {
            if (err) return res.status(500).json({ error: "Error guardando pago" });

            db.run(
                `UPDATE users SET plan=?, paypal_order_id=? WHERE id=?`,
                [planName, paypal_order_id, clinicId],
                function(err2) {
                    if (err2) return res.status(500).json({ error: "Error actualizando plan" });

                    db.get(`SELECT email, clinic_name FROM users WHERE id=?`, [clinicId], (e, user) => {
                        if (user) {
                            sendEmail(
                                user.email,
                                `¡Gracias ${user.clinic_name}! Tu plan ${planName} está activo.\n\nImporte: ${planAmount}€\nID transacción: ${paypal_order_id}`,
                                "✅ Plan activado en ReActiva"
                            );
                        }
                    });

                    res.json({ success: true, plan: planName });
                }
            );
        }
    );
});

// ══════════════════════════════════════════════
// ERROR HANDLER GLOBAL
// ══════════════════════════════════════════════
app.use((err, req, res, next) => {
    console.error("Error:", err.message);
    res.status(500).json({ error: "Error interno del servidor" });
});

// ══════════════════════════════════════════════
// INICIAR SERVIDOR
// ══════════════════════════════════════════════
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 ReActiva API corriendo en puerto ${PORT}`);
    console.log(`   Frontend URL: ${process.env.FRONTEND_URL || "*"}`);
    console.log(`   Email: ${process.env.EMAIL_USER || "no configurado"}`);
    console.log(`   Webhook: /webhook activo`);
});