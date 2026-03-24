const express = require("express");
const router = express.Router();
const db = require('../database.js');
const auth = require("../middleware/auth");

// ──────────────────────────────
// CONFIG
// ──────────────────────────────

const ALL_SLOTS = [
  '9:00','9:30','10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','16:00','16:30',
  '17:00','17:30','18:00','18:30','19:00'
];

const sanitize = (v) => v ? String(v).trim() : null;

// ──────────────────────────────
// HELPERS
// ──────────────────────────────

// 🔹 Detectar urgencia (VENTAS)
function detectarUrgencia(texto = "") {
  const t = texto.toLowerCase();
  return /dolor|urgente|muela|sangra|inflamado/.test(t);
}

// 🔹 Obtener slots libres
function obtenerSlibres(fecha, clinic_id) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT hora FROM citas WHERE fecha=? AND clinic_id=?`,
      [fecha, clinic_id],
      (err, rows) => {
        if (err) return reject(err);

        const ocupados = rows.map(r => r.hora);
        const libres = ALL_SLOTS.filter(h => !ocupados.includes(h));

        resolve(libres);
      }
    );
  });
}

// 🔹 Crear cita
function crearCita({ clinic_id, lead_id, fecha, hora, nombre, telefono, canal }) {
  return new Promise((resolve, reject) => {

    db.get(
      `SELECT id FROM citas WHERE fecha=? AND hora=? AND clinic_id=?`,
      [fecha, hora, clinic_id],
      (err, row) => {
        if (err) return reject(err);
        if (row) return reject(new Error("Slot ocupado"));

        db.run(
          `INSERT INTO citas 
          (clinic_id, lead_id, canal, name, phone, servicio, fecha, hora, status)
          VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            clinic_id,
            lead_id,
            canal || 'bot',
            nombre || 'Paciente',
            telefono || '',
            'Revisión dental',
            fecha,
            hora,
            'confirmada'
          ],
          function(err){
            if (err) return reject(err);
            resolve({ id: this.lastID });
          }
        );
      }
    );
  });
}

// ──────────────────────────────
// CREAR LEAD (MEJORADO CON VENTAS)
// ──────────────────────────────

function crearLead({clinic_id, name, phone, email, servicio, message, timestamp}, req, res) {

    const esUrgente = detectarUrgencia(message);

    db.run(
        `INSERT INTO leads (clinic_id, name, phone, email, servicio, message, timestamp, status)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          clinic_id,
          sanitize(name),
          sanitize(phone),
          sanitize(email),
          sanitize(servicio),
          message,
          timestamp,
          esUrgente ? "pending" : "new"
        ],
        function(err){

            if(err){
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
                timestamp,
                urgente: esUrgente
            };

            // 🔥 SOCKET REALTIME
            const io = req.app.get("io");
            if(io) io.to(`clinic_${clinic_id}`).emit("new_lead", leadData);

            // 🔥 EMAIL
            const sendEmail = req.app.get("sendEmail");
            if(sendEmail){
                const toEmail = process.env.CLINIC_EMAIL || process.env.EMAIL_USER;

                const emailText = `
📩 Nuevo paciente

${esUrgente ? "🚨 URGENTE 🚨\n" : ""}

Nombre: ${name || "—"}
Teléfono: ${phone || "—"}
Email: ${email || "—"}

Mensaje:
${message}
`;
                sendEmail(toEmail, emailText);
            }

            res.json({ success: true, lead_id: this.lastID });
        }
    );
}

// ──────────────────────────────
// LEADS
// ──────────────────────────────

// PUBLIC (landing)
router.post("/public", (req, res) => {
    const { message, phone, name, email, servicio, timestamp } = req.body;
    const clinic_id = process.env.DEFAULT_CLINIC_ID || 1;

    if(!message) return res.status(400).json({ error: "Mensaje obligatorio" });

    crearLead({
      clinic_id,
      name,
      phone,
      email,
      servicio,
      message,
      timestamp: timestamp || new Date().toISOString()
    }, req, res);
});

// PRIVADO
router.post("/", auth, (req, res) => {
    const { message, phone, name, email, servicio, timestamp } = req.body;
    const clinic_id = req.user.id;

    if(!message) return res.status(400).json({ error: "Mensaje obligatorio" });

    crearLead({
      clinic_id,
      name,
      phone,
      email,
      servicio,
      message,
      timestamp: timestamp || new Date().toISOString()
    }, req, res);
});

// GET LEADS
router.get("/", auth, (req, res) => {
    const clinic_id = req.user.id;

    db.all(
        `SELECT * FROM leads WHERE clinic_id=? ORDER BY id DESC`,
        [clinic_id],
        (err, rows) => {
            if(err) return res.status(500).json({ error: "Error cargando leads" });
            res.json(rows);
        }
    );
});

// STATUS
router.put("/:id/status", auth, (req, res) => {
    const { status } = req.body;
    const clinic_id = req.user.id;

    db.run(
        `UPDATE leads SET status=? WHERE id=? AND clinic_id=?`,
        [status, req.params.id, clinic_id],
        () => res.json({ success: true })
    );
});

// DELETE
router.delete("/:id", auth, (req, res) => {
    db.run(
        `DELETE FROM leads WHERE id=? AND clinic_id=?`,
        [req.params.id, req.user.id],
        () => res.json({ success: true })
    );
});

// ──────────────────────────────
// CITAS (CLAVE DEL NEGOCIO)
// ──────────────────────────────

// 🔹 Ver slots disponibles
router.get("/slots", auth, async (req, res) => {
    try {
        const { fecha } = req.query;
        const clinic_id = req.user.id;

        const libres = await obtenerSlibres(fecha, clinic_id);

        res.json({ fecha, libres, todos: ALL_SLOTS });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 🔹 Crear cita manual
router.post("/citas", auth, async (req, res) => {
    try {
        const clinic_id = req.user.id;
        const { fecha, hora, nombre, telefono } = req.body;

        const cita = await crearCita({
            clinic_id,
            fecha,
            hora,
            nombre,
            telefono,
            canal: 'manual'
        });

        res.json({ success: true, cita });

    } catch (e) {
        res.status(409).json({ error: e.message });
    }
});

// ──────────────────────────────

module.exports = router;
module.exports.crearCita = crearCita;
module.exports.obtenerSlibres = obtenerSlibres;