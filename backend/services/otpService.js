//backend>services>otpService.js 

const db = require("../database");
const bcrypt = require("bcryptjs");

// generar OTP
function createOTP(email, code) {
  const hash = bcrypt.hashSync(code, 10);

  db.run(`
    INSERT INTO otp_codes (email, code_hash, expires_at)
    VALUES (?, ?, datetime('now', '+5 minutes'))
  `, [email.toLowerCase(), hash]);
}

// verificar OTP
function verifyOTP(email, code, callback) {
  db.get(`
    SELECT * FROM otp_codes
    WHERE email=? AND used=0
    ORDER BY id DESC LIMIT 1
  `, [email.toLowerCase()], async (err, row) => {

    if (err || !row) return callback("Invalid OTP");

    // 🔥 VALIDACIÓN DE EXPIRACIÓN (CRÍTICO)
    if (new Date(row.expires_at) < new Date()) {
      return callback("OTP expirado");
    }

    const valid = await bcrypt.compare(code, row.code_hash);

    if (!valid) return callback("Invalid OTP");

    db.run(`UPDATE otp_codes SET used=1 WHERE id=?`, [row.id]);

    callback(null, true);
  });
}