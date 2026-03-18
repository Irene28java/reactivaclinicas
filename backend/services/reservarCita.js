const db = require("../database");

function reservarCita({clinicId, leadId, fecha, hora, name, phone, servicio, canal = "web", externalId = ""}, callback) {
    const createdAt = new Date().toISOString();

    // Insertar cita
    db.run(`INSERT INTO citas
        (clinic_id, lead_id, canal, external_id, name, phone, servicio, fecha, hora, status, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [clinicId, leadId, canal, externalId, name, phone, servicio, fecha, hora, "pendiente", createdAt],
        function(err) {
            if(err) return callback(err);

            // Bloquear horario
            db.run("UPDATE horarios SET disponible=0, lead_id=? WHERE clinic_id=? AND fecha=? AND hora=?",
                [leadId, clinicId, fecha, hora],
                (err2) => callback(err2, { citaId: this.lastID })
            );
        }
    );
}

module.exports = { reservarCita };