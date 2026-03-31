const attempts = new Map();

module.exports = function(req, res, next) {
  const ip = req.ip;
  const now = Date.now();

  const data = attempts.get(ip) || { count: 0, time: now };

  // reset cada 10 min
  if (now - data.time > 10 * 60 * 1000) {
    data.count = 0;
    data.time = now;
  }

  data.count++;

  attempts.set(ip, data);

  if (data.count > 5) {
    return res.status(429).json({
      error: "Demasiados intentos OTP"
    });
  }

  next();
};