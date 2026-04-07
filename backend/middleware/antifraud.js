//backend>middleware>authfraud.js 
module.exports = function antifraud(req, res, next) {
  const ip = req.ip;
  const ua = (req.headers["user-agent"] || "").toLowerCase();

  if (!ip || !ua) {
    return res.status(403).json({ error: "Blocked: missing headers" });
  }

  const blockedAgents = [
    "curl",
    "wget",
    "postman",
    "insomnia",
    "bot",
    "spider"
  ];

  if (blockedAgents.some(b => ua.includes(b))) {
    return res.status(403).json({ error: "Bot detected" });
  }

  // 🔥 protección básica contra flood
  if (!req.session) req.session = {};
  const now = Date.now();

  if (req.session.lastRequest && now - req.session.lastRequest < 300) {
    return res.status(429).json({ error: "Too many requests" });
  }

  req.session.lastRequest = now;

  next();
};