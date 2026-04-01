//backend>middleware>otpRateLimit.js

const attempts = new Map();

module.exports = function(req, res, next) {
  const ip = req.ip;
  const now = Date.now();

  const data = attempts.get(ip) || { count: 0, time: now };

  if (now - data.time > 10 * 60 * 1000) {
    data.count = 0;
    data.time = now;
  }

  data.count++;

  attempts.set(ip, data);

  // 🔥 limpieza simple
  if (attempts.size > 1000) {
    attempts.clear();
  }

  if (data.count > 5) {
    return res.status(429).json({
      error: "Demasiados intentos OTP"
    });
  }

  next();
};