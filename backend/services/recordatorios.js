const { crearRecordatorio } = require('../recordatorios.js'); // tu archivo existente

async function crearCita({ clinic_id, lead_id, fecha, hora, nombre, telefono, canal }) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id FROM citas WHERE fecha=? AND hora=? AND clinic_id=?`,
      [fecha, hora, clinic_id],
      async (err, row) => {
        if (err) return reject(err);
        if (row) return reject(new Error("Slot ocupado"));

        db.run(
          `INSERT INTO citas 
            (clinic_id, lead_id, canal, name, phone, servicio, fecha, hora, status) 
          VALUES (?,?,?,?,?,?,?,?,?)`,
          [clinic_id, lead_id, canal || 'bot', nombre || 'Paciente', telefono || '', 'Revisión dental', fecha, hora, 'confirmada'],
          async function (err) {
            if (err) return reject(err);
            const citaId = this.lastID;

            // 🔹 Crear recordatorio automático 24h antes
            try {
              const citaDate = new Date(`${fecha}T${hora}:00`);
              const reminderDate = new Date(citaDate.getTime() - 24 * 60 * 60 * 1000); // 24h antes

              await crearRecordatorio({
                leadId: lead_id,
                citaId,
                fecha: reminderDate.toISOString().slice(0,10),
                hora: reminderDate.toTimeString().slice(0,5),
                mensaje: `Hola ${nombre || 'Paciente'}, recuerda tu cita el ${fecha} a las ${hora}.`
              });
            } catch(e) {
              console.error("Error creando recordatorio:", e);
            }

            resolve({ id: citaId });
          }
        );
      }
    );
  });
}