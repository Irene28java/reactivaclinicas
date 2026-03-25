// backend/server.js
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
const { reservarCita }         = require("./services/reservarCita");
const { listenEmails }         = require("./services/gmailListener");
const { iniciarRecordatorios } = require("./services/recordatorios");

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────
const leadsRoutes     = require("./routes/leads");
const authRoutes      = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const pagosRouter     = require("./routes/payments");
const webhookRoutes   = require("./routes/webhook"); // FB/IG webhook
const { procesarMensaje } = require("./routes/bot");

// ─────────────────────────────────────────────
// APP & SERVER
// ─────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const JWT_SECRET = process.env.JWT_SECRET || "reactiva_secret";

// ─────────────────────────────────────────────
// BODY PARSER
// ─────────────────────────────────────────────
app.use((req, res, next) => {
    if (req.path.startsWith("/webhook") && req.method === "POST") {
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
        if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) callback(null, true);
        else callback(new Error("CORS bloqueado: " + origin));
    },
    credentials: true
}));
app.get("/api/leads", async (req, res) => {
  const leads = await db.getLeads();
  res.json(leads);
});

app.get("/api/messages/:leadId", async (req, res) => {
  const msgs = await db.getMessages(req.params.leadId);
  res.json(msgs);
});

app.get("/api/citas", async (req, res) => {
  const citas = await db.getCitas();
  res.json(citas);
});

// ─────────────────────────────────────────────
// SOCKET.IO
// ─────────────────────────────────────────────
const io = new Server(server, { cors: { origin: allowedOrigins.includes("*") ? "*" : allowedOrigins } });

// 🔥 DEBAJO DE const io = new Server(...)
global.io = io;

// 🔥 CAMBIO DE join_clinic → joinClinic
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next();
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user   = decoded;
        next();
    } catch (err) { next(new Error("Auth error")); }
});

io.on("connection", (socket) => {
    console.log("🔌 Cliente conectado:", socket.id);

    // 👈 Aquí es donde se cambió el evento
    socket.on("joinClinic", clinicId => {
        socket.join("clinic_" + clinicId);
    });

    socket.on("disconnect", () => console.log("🔌 Cliente desconectado:", socket.id));
});

app.set("io", io);

// ─────────────────────────────────────────────
// EMAIL — nodemailer
// ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

function sendEmail(to, text, subject = "ReActiva") {
    if (!process.env.EMAIL_USER) return;
    transporter.sendMail({
        from: `"ReActiva Clínicas" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:30px">
                <h2 style="color:#00e676;margin-bottom:16px">${subject}</h2>
                <p style="white-space:pre-line;color:#333;line-height:1.7">${text}</p>
                <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
                <p style="font-size:12px;color:#999">ReActiva Clínicas · Sistema automatizado de gestión</p>
               </div>`
    }).then(() => console.log(`📧 Email → ${to} | ${subject}`))
      .catch(err => console.error("❌ Error email:", err.message));
}
app.set("sendEmail", sendEmail);

// ─────────────────────────────────────────────
// MIDDLEWARE AUTH
// ─────────────────────────────────────────────
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token      = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Token requerido" });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); }
    catch { res.status(403).json({ error: "Token inválido" }); }
}

// ─────────────────────────────────────────────
// OTP LOGIN
// ─────────────────────────────────────────────
const otpStore = {};
const otpRequests = {};
const otpLimiter = rateLimit({ windowMs: 60_000, max: 5 });
function generarOTP() { return Math.floor(100_000 + Math.random() * 900_000).toString(); }

app.post("/api/request-otp", otpLimiter, (req,res)=>{
    const { email } = req.body;
    if(!email) return res.status(400).json({error:"Email requerido"});
    const now = Date.now();
    if(otpRequests[email] && now - otpRequests[email]<60_000) return res.status(429).json({error:"Espera 1 minuto"});
    const code = generarOTP();
    otpStore[email] = { code, expires: now+15*60_000 }; otpRequests[email]=now;
    sendEmail(email, `Tu código de acceso es: <b style="font-size:28px;letter-spacing:6px">${code}</b><br><br>Válido 15 minutos.`,"Tu código de acceso ReActiva");
    res.json({ success:true });
});

app.post("/api/verify-otp",(req,res)=>{
    const { email, code } = req.body;
    const record = otpStore[email];
    if(!record) return res.status(400).json({ error:"OTP inválido o expirado" });
    if(record.code!==code) return res.status(400).json({ error:"Código incorrecto" });
    if(Date.now()>record.expires) return res.status(400).json({ error:"Código expirado" });
    delete otpStore[email];
    db.get(`SELECT * FROM users WHERE email=?`, [email], (err,user)=>{
        if(err) return res.status(500).json({error:"Error DB"});
        if(!user) return res.status(404).json({error:"No existe cuenta"});
        const token = jwt.sign({ id:user.id,email:user.email,plan:user.plan,clinic_name:user.clinic_name }, JWT_SECRET, { expiresIn:"7d" });
        res.json({ token });
    });
});

// ─────────────────────────────────────────────
// ROUTAS
// ─────────────────────────────────────────────
app.use("/api/leads", leadsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/pagos", pagosRouter);
app.use("/webhook", webhookRoutes);

app.post("/api/chat", async (req,res)=>{
  const { message, sessionId, clinicId } = req.body;

  const respuesta = await procesarMensaje(message, {
    leadId: sessionId,
    clinicId
  });

  res.json({ reply: respuesta });
});
// ─────────────────────────────────────────────
// HEALTHCHECK
// ─────────────────────────────────────────────
app.get("/", (req,res)=>res.json({ status:"ok", service:"ReActiva API" }));
app.get("/health", (req,res)=>res.json({ status:"ok", timestamp:new Date().toISOString() }));

// ─────────────────────────────────────────────
// INICIAR SERVICIOS
// ─────────────────────────────────────────────
listenEmails(app);        // Gmail
iniciarRecordatorios(app); // Recordatorios

db.all("SELECT id FROM users", [], (err, rows)=>{
    if(!err && rows) rows.forEach(c=>{ try{ generarHorarios30Dias(c.id); } catch{} });
});

// Cron interno cada hora
const HORA_MS = 60*60*1000;
setInterval(()=>{ try{ require("./routes/webhook").procesarRecordatorios(app); } catch(e){ console.error(e); } }, HORA_MS);
setTimeout(()=>{ try{ require("./routes/webhook").procesarRecordatorios(app); } catch(e){ console.error(e); } }, 8_000);

// Suscripciones
setInterval(()=>{
    db.all(`SELECT * FROM users WHERE plan_status='active'`, [], (err, users)=>{
        if(err||!users) return;
        users.forEach(u=>{
            const start = new Date(u.plan_started_at);
            const diff = (Date.now()-start.getTime())/(1000*60*60*24);
            if(diff>30) db.run(`UPDATE users SET plan_status='inactive', plan='BASIC' WHERE id=?`,[u.id]);
        });
    });
}, HORA_MS);

// ERROR GLOBAL
app.use((err,req,res,next)=>{ console.error(err); res.status(500).json({error:"Internal server error"}); });

// ─────────────────────────────────────────────
// INICIAR SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, ()=>{
    console.log("");
    console.log("🚀 ReActiva API escuchando en puerto", PORT);
    console.log("📧 Gmail listener → activo");
    console.log("📅 Horarios → activo");
    console.log("🔔 Recordatorios → activo");
    console.log("🤖 Webhook FB/IG → /webhook");
    console.log("💬 Chat web → /api/chat");
});