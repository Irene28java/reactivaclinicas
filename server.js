require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require('./database');

const authRoutes = require('./routes/auth');
const leadsRoutes = require('./routes/leads');
const authMiddleware = require('./middleware/auth');

const app = express();

// ==========================
// MIDDLEWARE
// ==========================
app.use(express.json());

// Ajusta la URL de tu frontend Netlify
app.use(cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true
}));

// ==========================
// ROUTES
// ==========================
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);

// ==========================
// SOCKET SERVER
// ==========================
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL || "*" }
});

io.on("connection", (socket) => {
    console.log("Cliente conectado");
    socket.on("disconnect", () => console.log("Cliente desconectado"));
});

// ==========================
// DASHBOARD MÉTRICAS
// ==========================
app.get('/api/dashboard', authMiddleware, async (req, res) => {
    try {
        const clinicId = req.user.id;
        db.all(`SELECT * FROM leads WHERE clinic_id=?`, [clinicId], (err, leads) => {
            if (err) return res.status(500).json({ error: "Error cargando leads" });
            db.all(`SELECT * FROM pagos WHERE clinic_id=?`, [clinicId], (err, pagos) => {
                if (err) return res.status(500).json({ error: "Error cargando pagos" });

                const totalLeads = leads.length;
                const converted = leads.filter(l => l.status === "closed").length;
                const conversionRate = totalLeads > 0 ? (converted / totalLeads * 100).toFixed(1) : 0;
                const totalRevenue = pagos.reduce((acc, p) => acc + p.amount, 0);
                const revenuePerLead = totalLeads > 0 ? (totalRevenue / totalLeads).toFixed(2) : 0;

                res.json({ totalLeads, converted, conversionRate, totalRevenue, revenuePerLead });
            });
        });
    } catch {
        res.status(500).json({ error: "Error interno" });
    }
});

// ==========================
// EMAIL AUTOMÁTICO
// ==========================
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function sendAutoEmail(to, message) {
    transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject: "Hemos recibido tu solicitud",
        text: `Gracias por tu interés:\n\n${message}`
    });
}

// ==========================
// PAGO / PLAN
// ==========================
app.post('/api/payment', authMiddleware, (req, res) => {
    const clinicId = req.user.id;

    db.run(
        `INSERT INTO pagos (clinic_id,email,amount,created_at) VALUES (?,?,?,?)`,
        [clinicId, "premium@reactiva.com", 500, new Date().toISOString()],
        function (err) {
            if (err) return res.json({ success: false });
            db.run(
                `UPDATE users SET plan=? WHERE id=?`,
                ["premium", clinicId],
                function (err) {
                    if (err) return res.json({ success: false });
                    res.json({ success: true });
                }
            );
        }
    );
});

// ==========================
// INICIAR SERVIDOR
// ==========================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Servidor iniciado en puerto " + PORT));