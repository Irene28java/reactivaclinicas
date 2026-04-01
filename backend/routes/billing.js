const express = require("express");
const router = express.Router();

const paypal = require("../providers/paypal.provider");
const plans = require("../config/plans");
const db = require("../database");

const auth = require("../middleware/auth");
const antifraud = require("../middleware/antifraud");

router.use(auth);
router.use(antifraud);


// ──────────────────────────────
// CREATE ORDER
// ──────────────────────────────
router.post("/create-order", async (req, res) => {
  try {
    const { plan } = req.body;
    const selectedPlan = plans[plan];

    if (!selectedPlan) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const order = await paypal.createOrder({
      amount: selectedPlan.price,
      userId: req.user.id,
      plan
    });

    res.json(order);

  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Error creando orden" });
  }
});


// ──────────────────────────────
// CAPTURE ORDER (PRO SEGURO)
// ──────────────────────────────
router.post("/capture-order", async (req, res) => {
  try {
    const { orderID } = req.body;

    if (!orderID) {
      return res.status(400).json({ error: "Missing orderID" });
    }

    const result = await paypal.capture(orderID);

    if (result.status !== "COMPLETED") {
      return res.status(400).json({ error: "Pago no completado" });
    }

    const unit = result.purchase_units[0];

    const paidAmount = Number(
      unit.payments.captures[0].amount.value
    );

    const [userId, plan] = unit.custom_id.split("|");

    const selectedPlan = plans[plan];

    // 🔐 VALIDACIÓN ANTIFRAUDE
    if (!selectedPlan || paidAmount !== selectedPlan.price) {
      return res.status(400).json({
        error: "Fraud detected"
      });
    }

    // 🔁 PREVENIR PAGOS DUPLICADOS
    const existing = await new Promise(resolve => {
      db.get(
        `SELECT id FROM payments WHERE order_id=?`,
        [orderID],
        (err, row) => resolve(row)
      );
    });

    if (existing) {
      return res.json({ success: true, duplicate: true });
    }

    // 📅 CALCULAR DURACIÓN (CLAVE)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + selectedPlan.duration_days);

    // 💾 GUARDAR PAGO
    db.run(
      `INSERT INTO payments 
      (clinic_id, plan, amount, order_id, ip, user_agent, created_at)
      VALUES (?,?,?,?,?,?,datetime('now'))`,
      [
        userId,
        plan,
        paidAmount,
        orderID,
        req.ip,
        req.headers["user-agent"]
      ]
    );

    // 🚀 ACTIVAR PLAN CON EXPIRACIÓN
    db.run(
      `UPDATE users 
       SET 
         plan = ?, 
         plan_status = 'active',
         plan_started_at = CURRENT_TIMESTAMP,
         plan_expires_at = ?
       WHERE id = ?`,
      [plan, expiresAt.toISOString(), userId]
    );

    res.json({
      success: true,
      plan,
      expires_at: expiresAt
    });

  } catch (err) {
    console.error("CAPTURE ERROR:", err);
    res.status(500).json({ error: "Error capturando pago" });
  }
});

module.exports = router;