const express = require('express');
const router = express.Router();

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../database');

const { generateOTP } = require('../utils/otp');
const { sendOTP } = require('../utils/email');


// ─────────────────────────────
// 1. ENVIAR OTP
// ─────────────────────────────
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email requerido" });
  }

  const code = generateOTP();
  const hash = await bcrypt.hash(code, 10);

  db.run(`
    INSERT INTO otp_codes (email, code_hash, expires_at)
    VALUES (?, ?, datetime('now', '+5 minutes'))
  `, [email.toLowerCase(), hash]);

  await sendOTP(email, code);

  res.json({ success: true });
});


// ─────────────────────────────
// 2. VERIFY OTP + LOGIN
// ─────────────────────────────
router.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;

  db.get(`
    SELECT * FROM otp_codes
    WHERE email=? AND used=0
    ORDER BY id DESC LIMIT 1
  `, [email.toLowerCase()], async (err, row) => {

    if (err || !row) {
      return res.status(400).json({ error: "OTP inválido" });
    }

    // ⏳ CADUCADO
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: "OTP expirado" });
    }

    const valid = await bcrypt.compare(otp, row.code_hash);

    if (!valid) {
      return res.status(400).json({ error: "OTP incorrecto" });
    }

    db.run(`UPDATE otp_codes SET used=1 WHERE id=?`, [row.id]);

    // ───────── USER ─────────
    db.get(`SELECT * FROM users WHERE email=?`, [email.toLowerCase()], (err, user) => {

      if (!user) {

        db.run(`
          INSERT INTO users (email, role, created_at, plan_status)
          VALUES (?, 'owner', datetime('now'), 'inactive')
        `, [email.toLowerCase()], function () {

          const token = jwt.sign(
            { id: this.lastID, email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
          );

          return res.json({ token });
        });

      } else {

        const token = jwt.sign(
          { id: user.id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );

        return res.json({ token });
      }
    });
  });
});

module.exports = router;