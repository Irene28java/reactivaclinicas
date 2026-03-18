
module.exports = function (req, res, next) {
  const user = req.user;

  if (!user.plan || user.plan_status !== "active") {
    return res.status(403).json({
      error: "Plan inactivo. Actualiza tu suscripción."
    });
  }

  next();
};