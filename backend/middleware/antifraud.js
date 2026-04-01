// middleware/antifraud.js

module.exports = function antifraud(req, res, next) {
  const ip = req.ip;
  const ua = (req.headers["user-agent"] || "").toLowerCase();

  if (!ip || !ua) {
    return res.status(403).json({ error: "Blocked" });
  }

  const blocked = ["curl", "bot", "postman", "wget"];

  if (blocked.some(b => ua.includes(b))) {
    return res.status(403).json({ error: "Bot detected" });
  }

  next();
};