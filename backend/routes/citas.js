const express = require("express");
const router = express.Router();
const db = require('../database');
const auth = require("../middleware/auth");
const { crearCita, obtenerSlibres } = require('./leads'); // reutilizas helpers

// Slots disponibles
router.get("/slots", auth, async (req, res) => {
  try {
    const { fecha } = req.query;
    const libres = await obtenerSlibres(fecha, req.user.id);
    res.json({ fecha, libres });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Crear cita manual
router.post("/", auth, async (req, res) => {
  try {
    const { fecha, hora, nombre, telefono, lead_id } = req.body;
    const cita = await crearCita({ clinic_id: req.user.id, fecha, hora, nombre, telefono, lead_id });
    res.json({ success: true, cita });
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
});

// Listar citas
router.get("/", auth, (req, res) => {
  db.all(`SELECT * FROM citas WHERE clinic_id=? ORDER BY fecha,hora`, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: "Error cargando citas" });
    res.json(rows);
  });
});

// Actualizar status
router.put("/:id/status", auth, (req, res) => {
  const { status } = req.body;
  db.run(`UPDATE citas SET status=? WHERE id=? AND clinic_id=?`, [status, req.params.id, req.user.id], () => {
    res.json({ success: true });
  });
});

// Eliminar cita
router.delete("/:id", auth, (req, res) => {
  db.run(`DELETE FROM citas WHERE id=? AND clinic_id=?`, [req.params.id, req.user.id], () => {
    res.json({ success: true });
  });
});

module.exports = router;