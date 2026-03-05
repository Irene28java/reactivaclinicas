const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');

router.post('/register', async (req, res) => {
    const { clinic_name, email, password } = req.body;
    if (!clinic_name || !email || !password)
        return res.status(400).json({ error: "Campos obligatorios" });

    const hash = await bcrypt.hash(password, 10);

    db.run(
        `INSERT INTO users (clinic_name,email,password,plan,created_at) VALUES (?,?,?,?,?)`,
        [clinic_name, email, hash, "basic", new Date().toISOString()],
        function (err) {
            if (err) return res.status(400).json({ error: "Email ya registrado" });
            res.json({ success: true });
        }
    );
});

router.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email=?`, [email], async (err, user) => {
        if (!user) return res.status(400).json({ error: "No existe" });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: "Password incorrecto" });

        const token = jwt.sign({
            id: user.id,
            clinic_name: user.clinic_name,
            plan: user.plan
        }, process.env.JWT_SECRET, { expiresIn: "7d" });

        res.json({ token });
    });
});

module.exports = router;