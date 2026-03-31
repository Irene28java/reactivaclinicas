// middleware/antifraud.js

module.exports = function antifraud(req, res, next) {
  const ip = req.ip;
  const ua = req.headers["user-agent"];
  const tenantId = req.user?.tenant_id;

  if (!ip || !ua) {
    return res.status(403).json({ error: "Blocked" });
  }

  if (ua.includes("bot") || ua.includes("curl")) {
    return res.status(403).json({ error: "Bot detected" });
  }

  next();
};