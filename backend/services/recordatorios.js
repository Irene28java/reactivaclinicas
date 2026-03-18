// services/recordatorios.js
const db = require("../database");

function iniciarRecordatorios(app) {
  const HORA_MS = 60 * 60 * 1000;

  async function enviarRecordatorios() {
    const mañana = new Date();
    mañana.setDate(mañana.getDate() + 1);
    const fecha = mañana.toISOString().split("T")[0];

    db.all(`
      SELECT c.*, u.clinic_name, u.email AS clinic_email
      FROM citas c
      LEFT JOIN users u ON u.id = c.clinic_id
      WHERE c.fecha=? AND c.status='confirmada'
    `, [fecha], (err, citas) => {
      if (err) return console.error("❌ Error al obtener citas:", err);
      if (!citas || citas.length === 0) return;

      const sendEmail = app.get("sendEmail");

      citas.forEach(c => {
        if (sendEmail && c.email) { // aquí usamos el email del paciente
          const subject = `Recordatorio cita ${c.clinic_name}`;
          const text = `
Hola ${c.name},

Te recordamos tu cita programada para mañana:

📅 Fecha: ${c.fecha}
⏰ Hora: ${c.hora}
🏥 Clínica: ${c.clinic_name}

Si necesitas cancelar o reprogramar, por favor contáctanos.
          `;
          sendEmail(c.email, text, subject);
          console.log(`🔔 Recordatorio enviado a ${c.name} | ${c.fecha} ${c.hora}`);
        }
      });
    });
  }

  // Ejecutar cada hora
  setInterval(enviarRecordatorios, HORA_MS);
  setTimeout(enviarRecordatorios, 8_000); // primera vez 8s después de iniciar
}

module.exports = { iniciarRecordatorios };