// backend/billing/billing.service.js

const plans = require("../config/plans");
const paypal = require("../providers/paypal.provider");
const db = require("../database");

function getPrice(plan) {
  return plans[plan].price;
}

async function createCheckout(user, plan) {
  return paypal.createOrder(getPrice(plan));
}

async function confirmPayment({ orderID, plan, user }) {
  const result = await paypal.capture(orderID);

  if (result.status !== "COMPLETED") {
    throw new Error("Payment failed");
  }

  const amount = Number(
    result.purchase_units[0].payments.captures[0].amount.value
  );

  if (amount !== getPrice(plan)) {
    throw new Error("Fraud detected");
  }

  db.run(
    `UPDATE users SET plan=?, plan_status='active', plan_started_at=CURRENT_TIMESTAMP WHERE id=?`,
    [plan, user.id]
  );

  db.run(
    `INSERT INTO payments (clinic_id, plan, amount, order_id, created_at)
     VALUES (?,?,?,?,datetime('now'))`,
    [user.id, plan, amount, orderID]
  );

  return true;
}

module.exports = { createCheckout, confirmPayment };