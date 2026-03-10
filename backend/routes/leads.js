// backend/routes/leads.js

const express = require("express");
const router = express.Router();
const db = require("../database");
const auth = require("../middleware/auth");

// sanitizador simple
const sanitize = (v) => v ? String(v).trim() : null;


// ─────────────────────────────────────────────
// POST /api/leads/public
// Leads desde landing page (sin autenticación)
// ─────────────────────────────────────────────
router.post("/public", (req, res) => {

    const { message, phone, name, email, servicio, timestamp } = req.body;
    const clinic_id = process.env.DEFAULT_CLINIC_ID || 1;

    if (!message) {
        return res.status(400).json({ error: "Mensaje obligatorio" });
    }

    if (message.length > 2000) {
        return res.status(400).json({ error: "Mensaje demasiado largo" });
    }

    const leadTimestamp = timestamp || new Date().toISOString();

    db.run(
        `INSERT INTO leads 
        (clinic_id, name, phone, email, servicio, message, timestamp, status)
        VALUES (?,?,?,?,?,?,?,?)`,
        [
            clinic_id,
            sanitize(name),
            sanitize(phone),
            sanitize(email),
            sanitize(servicio),
            message,
            leadTimestamp,
            "new"
        ],
        function (err) {

            if (err) {
                console.error("Error guardando lead:", err);
                return res.status(500).json({ error: "Error guardando lead" });
            }

            const leadData = {
                id: this.lastID,
                name,
                phone,
                email,
                servicio,
                message,
                timestamp: leadTimestamp,
                status: "new"
            };

            // SOCKET.IO
            const io = req.app.get("io");
            if (io) {
                io.to(`clinic_${clinic_id}`).emit("new_lead", leadData);
            }

            // EMAIL AUTOMÁTICO
            const sendEmail = req.app.get("sendEmail");
            if (sendEmail) {

                const toEmail =
                    process.env.CLINIC_EMAIL ||
                    process.env.EMAIL_USER;

                const emailText = `
📩 Nuevo lead en tu web

Nombre: ${name || "—"}
Teléfono: ${phone || "—"}
Email: ${email || "—"}
Servicio: ${servicio || "—"}

Mensaje:
${message}
`;

                sendEmail(toEmail, emailText);
            }

            res.json({
                success: true,
                lead_id: this.lastID
            });

        }
    );

});


// ─────────────────────────────────────────────
// POST /api/leads
// Leads desde bot instalado en web cliente
// ─────────────────────────────────────────────
router.post("/", auth, (req, res) => {

    const { message, phone, name, email, servicio, timestamp } = req.body;
    const clinic_id = req.user.id;

    if (!message) {
        return res.status(400).json({ error: "Mensaje obligatorio" });
    }

    if (message.length > 2000) {
        return res.status(400).json({ error: "Mensaje demasiado largo" });
    }

    const leadTimestamp = timestamp || new Date().toISOString();

    db.run(
        `INSERT INTO leads
        (clinic_id, name, phone, email, servicio, message, timestamp, status)
        VALUES (?,?,?,?,?,?,?,?)`,
        [
            clinic_id,
            sanitize(name),
            sanitize(phone),
            sanitize(email),
            sanitize(servicio),
            message,
            leadTimestamp,
            "new"
        ],
        function (err) {

            if (err) {
                console.error("Error guardando lead:", err);
                return res.status(500).json({ error: "Error guardando lead" });
            }

            const leadData = {
                id: this.lastID,
                name,
                phone,
                email,
                servicio,
                message,
                timestamp: leadTimestamp,
                status: "new"
            };

            // SOCKET.IO
            const io = req.app.get("io");
            if (io) {
                io.to(`clinic_${clinic_id}`).emit("new_lead", leadData);
            }

            // EMAIL AUTOMÁTICO
            const sendEmail = req.app.get("sendEmail");

            if (sendEmail) {

                db.get(
                    `SELECT email FROM users WHERE id=?`,
                    [clinic_id],
                    (err, user) => {

                        if (err) {
                            console.error("Error buscando usuario:", err);
                            return;
                        }

                        if (user?.email) {

                            const emailText = `
📩 Nuevo lead

Nombre: ${name || "—"}
Teléfono: ${phone || "—"}
Email: ${email || "—"}
Servicio: ${servicio || "—"}

Mensaje:
${message}
`;

                            sendEmail(user.email, emailText);
                        }

                    }
                );

            }

            res.json({
                success: true,
                lead_id: this.lastID
            });

        }
    );

});


// ─────────────────────────────────────────────
// GET /api/leads
// Obtener todos los leads
// ─────────────────────────────────────────────
router.get("/", auth, (req, res) => {

    const clinic_id = req.user.id;

    db.all(
        `SELECT * FROM leads 
        WHERE clinic_id=? 
        ORDER BY id DESC`,
        [clinic_id],
        (err, rows) => {

            if (err) {
                console.error("Error cargando leads:", err);
                return res.status(500).json({ error: "Error cargando leads" });
            }

            res.json(rows);

        }
    );

});


// ─────────────────────────────────────────────
// PUT estado
// ─────────────────────────────────────────────
router.put("/:id/status", auth, (req, res) => {

    const { status } = req.body;

    const validStatuses = ["new","pending","closed"];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Estado inválido" });
    }

    db.run(
        `UPDATE leads 
         SET status=? 
         WHERE id=? AND clinic_id=?`,
        [
            status,
            req.params.id,
            req.user.id
        ],
        function (err) {

            if (err) {
                console.error("Error actualizando lead:", err);
                return res.status(500).json({ error: "Error actualizando lead" });
            }

            res.json({ success: true });

        }
    );

});


// ─────────────────────────────────────────────
// DELETE lead
// ─────────────────────────────────────────────
router.delete("/:id", auth, (req, res) => {

    db.run(
        `DELETE FROM leads 
         WHERE id=? AND clinic_id=?`,
        [
            req.params.id,
            req.user.id
        ],
        function (err) {

            if (err) {
                console.error("Error eliminando lead:", err);
                return res.status(500).json({ error: "Error eliminando lead" });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: "Lead no encontrado" });
            }

            res.json({ success: true });

        }
    );

});

module.exports = router;