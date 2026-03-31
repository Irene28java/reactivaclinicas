const db = require("../database");

module.exports = function (req, res, next) {
  const userId = req.user.id;

  db.get(`SELECT plan, plan_status FROM users WHERE id=?`, [userId], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: "Usuario inválido" });
    }

    if (!user.plan || user.plan_status !== "active") {
      return res.status(403).json({
        error: "Plan inactivo. Actualiza tu suscripción."
      });
    }

    req.user.plan = user.plan;
    req.user.plan_status = user.plan_status;

    next();
  });
};