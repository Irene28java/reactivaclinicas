const db = require("../database");

function generarHorariosDia(clinicId, fecha) {
  db.get("SELECT * FROM config_clinica WHERE clinic_id=?", [clinicId], (err, config) => {
    if (!config) return;
    const inicio = config.hora_inicio;
    const fin = config.hora_fin;
    const duracion = config.duracion_cita;

    let [h, m] = inicio.split(":").map(Number);

    while (true) {
      const hora = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      db.run(`INSERT OR IGNORE INTO horarios (clinic_id, fecha, hora, disponible) VALUES (?,?,?,1)`,
        [clinicId, fecha, hora]);
      m += duracion;
      if (m >= 60) { h++; m -= 60; }
      if (`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` >= fin) break;
    }
  });
}

function generarHorarios30Dias(clinicId) {
  const hoy = new Date();
  for (let i = 0; i < 30; i++) {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() + i);
    const fechaStr = fecha.toISOString().split("T")[0];
    generarHorariosDia(clinicId, fechaStr);
  }
}

module.exports = { generarHorariosDia, generarHorarios30Dias };