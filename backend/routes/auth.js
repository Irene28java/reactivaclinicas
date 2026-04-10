const express = require('express');
const router = express.Router();

const jwt = require('jsonwebtoken');

const { generateOTP } = require('../utils/otp');
const { sendOTP } = require('../utils/email');
const { createOTP, verifyOTP } = require('../services/otpService');
const { createTenantIfNotExists } = require('../services/tenant.service');

const otpRateLimit = require('../middleware/otpRateLimit');

// ─────────────────────────────
// 1. ENVIAR OTP
// ─────────────────────────────
router.post('/send-otp', otpRateLimit, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email requerido" });
  }

  const code = generateOTP();

  // guardar OTP
  createOTP(email, code);

  // enviar email
  await sendOTP(email, code);

  console.log("OTP generado:", code);

  res.json({ success: true });
});


// ─────────────────────────────
// 2. VERIFY OTP + LOGIN SEGURO
// ─────────────────────────────
router.post('/verify-otp', otpRateLimit, (req, res) => {
  const { email, otp } = req.body;

  verifyOTP(email, otp, (err) => {
    if (err) {
      return res.status(400).json({ error: "OTP inválido" });
    }

    // 🔥 AQUÍ INTEGRAMOS MULTI-TENANT
    createTenantIfNotExists(email, (err, tenantId) => {

      if (err) {
        return res.status(500).json({ error: "Tenant error" });
      }

      const token = jwt.sign(
        {
          email,
          tenant_id: tenantId
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({ token });
    });
  });
});

module.exports = router;