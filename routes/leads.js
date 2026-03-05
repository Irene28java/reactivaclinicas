const express = require("express");
const router = express.Router();
const db = require("../database");
const auth = require("../middleware/auth");

router.post("/", auth, (req, res) => {
    const { message, phone, name, timestamp } = req.body;
    const clinic_id = req.user.id;

    if (!message) return res.status(400).json({ error: "Mensaje obligatorio" });

    db.run(
        `INSERT INTO leads (clinic_id,name,phone,message,timestamp,status) VALUES (?,?,?,?,?,?)`,
        [clinic_id, name || null, phone || null, message, timestamp || new Date().toISOString(), "new"],
        function (err) {
            if (err) return res.status(500).json({ error: "Error guardando lead" });
            res.json({ success: true, lead_id: this.lastID });
        }
    );
});

router.get("/", auth, (req, res) => {
    const clinic_id = req.user.id;
    db.all(`SELECT * FROM leads WHERE clinic_id=? ORDER BY id DESC`, [clinic_id], (err, rows) => {
        if (err) return res.status(500).json({ error: "Error cargando leads" });
        res.json(rows);
    });
});

router.put("/:id/status", auth, (req, res) => {
    const lead_id = req.params.id;
    const { status } = req.body;
    db.run(`UPDATE leads SET status=? WHERE id=?`, [status, lead_id], function (err) {
        if (err) return res.status(500).json({ error: "Error actualizando lead" });
        res.json({ success: true });
    });
});

router.delete("/:id", auth, (req, res) => {
    const lead_id = req.params.id;
    db.run(`DELETE FROM leads WHERE id=?`, [lead_id], function (err) {
        if (err) return res.status(500).json({ error: "Error eliminando lead" });
        res.json({ success: true });
    });
});

module.exports = router;