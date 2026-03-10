require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const nodemailer = require("nodemailer");

const db = require("./database");

// ───── RUTAS ─────
const leadsRoutes = require("./routes/leads");
const authRoutes  = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const webhookRoutes  = require("./routes/webhook");
// const pagosRouter = require("./routes/pagos"); // si lo vas a usar

const authMiddleware = require("./middleware/auth");
const reminders = require("./reminders");

const app = express();
const server = http.createServer(app);
const JWT_SECRET = process.env.JWT_SECRET || "reactiva_secret";

// ───── MIDDLEWARE ─────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
const allowedOrigins = (process.env.FRONTEND_URL || "*")
  .split(",")
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS bloqueado " + origin));
    }
  },
  credentials: true
}));

// ───── SOCKET.IO ─────
const io = new Server(server, {
  cors: { origin: allowedOrigins.includes("*") ? "*" : allowedOrigins }
});

io.on("connection", (socket) => {
  console.log("Cliente conectado", socket.id);

  socket.on("join_clinic", (clinicId) => {
    socket.join("clinic_" + clinicId);
  });

  socket.on("disconnect", () => {
    console.log("Cliente desconectado");
  });
});

app.set("io", io);

// ───── EMAIL ─────
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
    from: `"ReActiva Clínicas" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: `<div style="font-family:sans-serif;padding:30px">
             <h2 style="color:#00e676">${subject}</h2>
             <p>${text}</p>
           </div>`
  });
}

app.set("sendEmail", sendEmail);

// ───── OTP LOGIN ─────
const otpStore = {};
const otpRequests = {};
const otpLimiter = rateLimit({ windowMs: 60000, max: 5 });

function generarOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post("/api/request-otp", otpLimiter, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email requerido" });

  const now = Date.now();
  if (otpRequests[email] && now - otpRequests[email] < 60000)
    return res.status(429).json({ error: "Espera 1 minuto" });

  const code = generarOTP();
  otpStore[email] = { code, expires: now + 15 * 60_000 };
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

    const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  });
});

// ───── RUTAS ─────
app.use("/api/leads", leadsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/webhook", webhookRoutes);
// app.use("/api/pagos", pagosRouter); // activar si existe

// ───── HEALTHCHECK ─────
app.get("/", (req, res) => res.json({ status: "ok", service: "ReActiva API" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ───── REMINDERS ─────
reminders.init(app);

// ───── START ─────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("API corriendo puerto", PORT));