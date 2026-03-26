//bax
async function reservarCita(data) {
  return new Promise((resolve, reject) => {

    db.get(
      `SELECT id FROM citas WHERE fecha=? AND hora=? AND clinic_id=? AND status!='cancelado'`,
      [data.fecha, data.hora, data.clinicId],
      (err, row) => {

        if (err) return reject(err);
        if (row) return reject(new Error("Slot ocupado"));

        db.run(`INSERT INTO citas
          (clinic_id, lead_id, canal, name, phone, servicio, fecha, hora, status)
          VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            data.clinicId,
            data.leadId,
            data.canal || "bot",
            data.name || "Paciente",
            data.phone || "",
            data.servicio || "Consulta",
            data.fecha,
            data.hora,
            "confirmada"
          ],
          async function(err) {

            if (err) return reject(err);

            // bloquear horario
            db.run(
              "UPDATE horarios SET disponible=0 WHERE clinic_id=? AND fecha=? AND hora=?",
              [data.clinicId, data.fecha, data.hora]
            );

            // recordatorio automático
            try {
              const citaDate = new Date(`${data.fecha}T${data.hora}`);
              const reminder = new Date(citaDate.getTime() - 86400000);

              await crearRecordatorio({
                leadId: data.leadId,
                citaId: this.lastID,
                fecha: reminder.toISOString().slice(0,10),
                hora: reminder.toTimeString().slice(0,5),
                mensaje: `Recuerda tu cita el ${data.fecha} a las ${data.hora}`
              });
            } catch(e){}

            resolve({ id: this.lastID });
          }
        );
      }
    );
  });
}