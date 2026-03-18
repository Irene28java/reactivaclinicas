require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const nodemailer = require("nodemailer");
const db = require("./database");

// SERVICES
const { generarHorariosDia, generarHorarios30Dias } = require("./services/horariosGenerator");
const { reservarCita } = require("./services/reservarCita");
const { listenEmails } = require("./services/gmailListener");
const { iniciarRecordatorios } = require("./services/recordatorios");

// ROUTES
const leadsRoutes = require("./routes/leads");
const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const webhookRoutes = require("./routes/webhook");
const pagosRouter = require("./routes/payments");

const app = express();
const server = http.createServer(app);
const JWT_SECRET = process.env.JWT_SECRET || "reactiva_secret";

// ─────────────────────────────
// BODY PARSER
// ─────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith("/webhook")) {
    express.raw({ type: "*/*" })(req, res, () => {
      try { req.body = JSON.parse(req.body.toString()); } catch { req.body = {}; }
      next();
    });
  } else express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────
// CORS
// ─────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || "*").split(",").map(o => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("CORS bloqueado: " + origin));
  },
  credentials: true
}));

// ─────────────────────────────
// SOCKET.IO
// ─────────────────────────────
const io = new Server(server, { cors: { origin: allowedOrigins.includes("*") ? "*" : allowedOrigins } });
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch(err) {
    next(new Error("Auth error"));
  }
});
io.on("connection", (socket) => {
  console.log("Cliente conectado", socket.id);
  socket.on("join_clinic", clinicId => socket.join("clinic_" + clinicId));
  socket.on("disconnect", () => console.log("Cliente desconectado"));
});
app.set("io", io);

// ─────────────────────────────
// EMAIL
// ─────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});
function sendEmail(to, text, subject = "ReActiva") {
  if (!process.env.EMAIL_USER) return;
  transporter.sendMail({
    from: `"ReActiva Clínicas" <${process.env.EMAIL_USER}>`,
    to, subject,
    html: `<div style="font-family:sans-serif;padding:30px"><h2 style="color:#00e676">${subject}</h2><p>${text}</p></div>`
  });
}
app.set("sendEmail", sendEmail);

// ─────────────────────────────
// OTP LOGIN
// ─────────────────────────────
const otpStore = {};
const otpRequests = {};
const otpLimiter = rateLimit({ windowMs: 60000, max: 5 });
function generarOTP() { return Math.floor(100000 + Math.random()*900000).toString(); }

app.post("/api/request-otp", otpLimiter, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email requerido" });
  const now = Date.now();
  if (otpRequests[email] && now - otpRequests[email] < 60000) return res.status(429).json({ error: "Espera 1 minuto" });
  const code = generarOTP();
  otpStore[email] = { code, expires: now + 15*60_000 };
  otpRequests[email] = now;
  sendEmail(email, `Tu código de acceso es: <b>${code}</b><br>Válido 15 minutos`, "Tu código de acceso ReActiva");
  res.json({ success: true });
});

app.post("/api/verify-otp", (req, res) => {
  const { email, code } = req.body;
  const record = otpStore[email];
  if (!record) return res.status(400).json({ error: "OTP inválido" });
  if (record.code !== code) return res.status(400).json({ error: "Código incorrecto" });
  if (Date.now() > record.expires) return res.status(400).json({ error: "Código expirado" });
  delete otpStore[email];
  db.get(`SELECT * FROM users WHERE email=?`, [email], (err, user) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!user) return res.status(404).json({ error: "Usuario no existe" });
    const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn:"7d" });
    res.json({ token });
  });
});

// ─────────────────────────────
// RUTAS
// ─────────────────────────────
app.use("/api/leads", leadsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/pagos", pagosRouter);
app.use("/webhook", webhookRoutes);

// ─────────────────────────────
// CHAT WEB
// ─────────────────────────────
app.post("/api/chat", async (req,res) => {
  const { message, sessionId, canal, externalId, userName, userEmail, userPhone } = req.body;
  if(!message || !sessionId) return res.status(400).json({ error:"Faltan datos" });

  const fecha = new Date().toISOString().split("T")[0];
  const hora = new Date().toISOString().split("T")[1].split(".")[0];
  const status = "pendiente";

  db.get("SELECT * FROM citas WHERE fecha=? AND hora=? AND clinic_id=?", [fecha, hora, 1], (err,row) => {
    if(!row){
      db.run(`INSERT INTO citas (clinic_id, lead_id, canal, external_id, name, phone, servicio, fecha, hora, status, created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              [1, null, canal||"web", externalId||"", userName||"", userPhone||"", "General", fecha, hora, status, new Date().toISOString()]
      );
    }
  });

  const io = req.app.get("io");
  io.to("clinic_1").emit("new_message",{message, canal, userName, userEmail});
  res.json({ reply:"Mensaje recibido y registrado en la agenda ✅" });
});

// ─────────────────────────────
// HEALTHCHECK
// ─────────────────────────────
app.get("/", (req,res)=>res.json({status:"ok", service:"ReActiva API"}));
app.get("/health", (req,res)=>res.json({status:"ok"}));

// ─────────────────────────────
// INICIAR SERVICIOS
// ─────────────────────────────
listenEmails(app);              // Gmail listener
iniciarRecordatorios();         // Recordatorios 24h
db.all("SELECT id FROM users", (err, rows)=>{ // Horarios 30 días
  if(!err && rows) rows.forEach(c=> generarHorarios30Dias(c.id));
});

// ─────────────────────────────
// SUSCRIPCIONES AUTOMÁTICAS
// ─────────────────────────────
function checkSubscriptions() {
  db.all(`SELECT * FROM users WHERE plan_status='active'`, [], (err, users) => {
    if (err) return console.error(err);

    users.forEach(user => {
      const start = new Date(user.plan_started_at);
      const now = new Date();
      const diffDays = (now - start) / (1000 * 60 * 60 * 24);

      // ⛔ 30 días sin renovar → downgrade
      if (diffDays > 30) {
        db.run(`UPDATE users SET plan_status='inactive', plan='BASIC' WHERE id=?`, [user.id]);
        console.log(`Usuario ${user.id} downgraded por falta de pago`);
      }
    });
  });
}

// Ejecutar cada hora
setInterval(checkSubscriptions, 1000 * 60 * 60);

// ─────────────────────────────
// ERROR GLOBAL
// ─────────────────────────────
app.use((err, req, res, next)=>{
  console.error("Server error:", err);
  res.status(500).json({ error:"Internal server error" });
});

// ─────────────────────────────
// START SERVER
// ─────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, ()=>{
  console.log("🚀 ReActiva API iniciada");
  console.log("🌐 Puerto:", PORT);
  console.log("📧 Gmail listener activo");
  console.log("📅 Sistema de horarios activo");
  console.log("🔔 Recordatorios activos");
});