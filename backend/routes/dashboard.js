//backend>routes>dashboard.js
const express = require("express");
const router = express.Router();
const db = require("../database");
const authMiddleware = require("../middleware/auth");

// ──────────────────────────────
// Dashboard stats
// ──────────────────────────────
router.get("/", authMiddleware, (req, res) => {

  const clinicId = req.user.id;

  db.all(
    `SELECT * FROM leads WHERE clinic_id=? ORDER BY timestamp DESC`,
    [clinicId],
    (err, leads) => {

      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Error obteniendo leads" });
      }

      const totalLeads = leads.length;

      const converted = leads.filter(l => l.status === "closed").length;

      const conversionRate =
        totalLeads > 0
          ? ((converted / totalLeads) * 100).toFixed(1)
          : 0;

      // ingresos estimados (300€ por cliente)
      const totalRevenue = converted * 300;

      const byService = {};
      leads.forEach(l => {
        if (!l.servicio) return;
        if (!byService[l.servicio]) byService[l.servicio] = 0;
        byService[l.servicio]++;
      });

      res.json({
        totalLeads,
        converted,
        conversionRate,
        totalRevenue,
        byService
      });

    }
  );
});

module.exports = router;