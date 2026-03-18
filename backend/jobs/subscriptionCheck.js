const db = require("../database");

function checkSubscriptions() {
  db.all(`SELECT * FROM users WHERE plan_status='active'`, [], (err, users) => {
    if (err || !users) return;

    users.forEach(user => {
      const start = new Date(user.plan_started_at);
      const now = new Date();
      const diffDays = (now - start) / (1000 * 60 * 60 * 24);

      // ⛔ 30 días sin renovar → downgrade a inactivo
      if (diffDays > 30) {
        db.run(
          `UPDATE users SET plan_status='inactive' WHERE id=?`,
          [user.id]
        );
      }
    });
  });
}

module.exports = checkSubscriptions;