const db = require("../database");
const crypto = require("crypto");

function createTenantIfNotExists(email, callback) {
  db.get(
    `SELECT * FROM users WHERE email=?`,
    [email],
    (err, user) => {
      if (err) return callback(err);

      // si usuario ya tiene tenant
      if (user && user.tenant_id) {
        return callback(null, user.tenant_id);
      }

      const tenantId = crypto.randomUUID();

      db.run(
        `INSERT INTO tenants (id, name, status)
         VALUES (?, ?, 'active')`,
        [tenantId, `Clinic ${email.split("@")[0]}`],
        (err) => {
          if (err) return callback(err);

          db.run(
            `INSERT INTO users (email, tenant_id, role)
             VALUES (?, ?, 'owner')`,
            [email, tenantId],
            function (err2) {
              if (err2) return callback(err2);

              callback(null, tenantId);
            }
          );
        }
      );
    }
  );
}

module.exports = { createTenantIfNotExists };