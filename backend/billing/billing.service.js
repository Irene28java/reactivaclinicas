// backend/billing/billing.service.js

const plans = require("../config/plans");
const paypal = require("../providers/paypal.provider");
const db = require("../database");

async function confirmPayment({ orderID }) {

  // 🔒 evitar duplicados
  const existing = await db.get(
    "SELECT id FROM payments WHERE order_id = ?",
    [orderID]
  );

  if (existing) throw new Error("Duplicate payment");

  const result = await paypal.capture(orderID);

  if (result.status !== "COMPLETED") {
    throw new Error("Payment not completed");
  }

  const purchase = result.purchase_units?.[0];
  const capture = purchase?.payments?.captures?.[0];

  if (!capture) throw new Error("Invalid PayPal response");

  const amount = Number(capture.amount.value);

  // 🔐 metadata segura
  const [userId, plan] = purchase.custom_id.split("|");

  if (!plans[plan]) throw new Error("Invalid plan");

  if (amount !== plans[plan].price) {
    throw new Error("Amount mismatch");
  }

  // 💾 activar usuario
  await db.run(
    `UPDATE users 
     SET plan=?, plan_status='active', plan_started_at=CURRENT_TIMESTAMP 
     WHERE id=?`,
    [plan, userId]
  );

  // 💾 guardar pago
  await db.run(
    `INSERT INTO payments (clinic_id, plan, amount, order_id, created_at)
     VALUES (?,?,?,?,datetime('now'))`,
    [userId, plan, amount, orderID]
  );

  console.log("✅ Pago confirmado:", { userId, plan, amount });

  return true;
}

module.exports = { confirmPayment };