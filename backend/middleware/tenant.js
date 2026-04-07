// middleware/tenant.js
const db = require("../database");

module.exports = function tenant(req, res, next) {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!user.tenant_id) {
      return res.status(403).json({ error: "No tenant assigned" });
    }

    // 🔥 inyectar tenant en request
    req.tenant = {
      id: user.tenant_id,
      role: user.role
    };

    next();

  } catch (err) {
    console.error("TENANT ERROR:", err);
    res.status(500).json({ error: "Tenant error" });
  }
};