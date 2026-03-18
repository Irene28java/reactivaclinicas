const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const db = require("../database");
const auth = require("../middleware/auth");

const PAYPAL_API = "https://api-m.paypal.com";

// ──────────────────────────────
// PLANES
// ──────────────────────────────
const PLANES = {
  BASIC: { price: 169, renewal: 29, name: "BASIC" },
  PREMIUM: { price: 299, renewal: 49, name: "PREMIUM" }
};

// ──────────────────────────────
// TOKEN PAYPAL
// ──────────────────────────────
async function getAccessToken() {
  const authHeader = Buffer.from(
    process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_SECRET
  ).toString("base64");

  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${authHeader}` },
    body: "grant_type=client_credentials"
  });

  const data = await res.json();
  return data.access_token;
}

// ──────────────────────────────
// CREAR ORDEN
// ──────────────────────────────
router.post("/create-order", auth, async (req, res) => {
  try {
    const { plan } = req.body;
    const selectedPlan = PLANES[plan];

    if (!selectedPlan) return res.status(400).json({ error: "Plan inválido" });

    const accessToken = await getAccessToken();
    const user = req.user;

    const start = new Date(user.plan_started_at || 0);
    const now = new Date();
    const diffDays = (now - start) / (1000 * 60 * 60 * 24);

    // 🔁 renovación mensual después del primer mes
    let price = selectedPlan.price;
    if (diffDays > 30) price = selectedPlan.renewal;

    // Crear orden en PayPal
    const order = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: "EUR", value: price }
          }
        ]
      })
    });

    const data = await order.json();
    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creando orden" });
  }
});

// ──────────────────────────────
// CAPTURE + SEGURIDAD + ACTIVACIÓN
// ──────────────────────────────
router.post("/capture-order", auth, async (req, res) => {
  try {
    const { orderID, plan } = req.body;
    const selectedPlan = PLANES[plan];

    if (!selectedPlan) return res.status(400).json({ error: "Plan inválido" });

    const accessToken = await getAccessToken();

    const capture = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      }
    });

    const result = await capture.json();

    // 🔴 VALIDAR ESTADO
    if (result.status !== "COMPLETED")
      return res.status(400).json({ error: "Pago no completado" });

    const paidAmount = Number(result.purchase_units[0].payments.captures[0].amount.value);

    // 🔴 CALCULAR PRECIO ESPERADO
    const user = req.user;
    const start = new Date(user.plan_started_at || 0);
    const now = new Date();
    const diffDays = (now - start) / (1000 * 60 * 60 * 24);

    let expectedAmount = selectedPlan.price;
    if (diffDays > 30) expectedAmount = selectedPlan.renewal;

    // 🔴 ANTIFRAUDE
    if (paidAmount !== expectedAmount)
      return res.status(400).json({ error: "Monto inválido (posible manipulación)" });

    const clinicId = user.id;

    // 🔴 EVITAR DUPLICADOS
    db.get(`SELECT id FROM payments WHERE order_id=?`, [orderID], async (err, row) => {
      if (row) return res.json({ success: true });

      // GUARDAR PAGO
      db.run(
        `INSERT INTO payments 
         (clinic_id, plan, amount, order_id, ip, user_agent, created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [clinicId, selectedPlan.name, paidAmount, orderID, req.ip, req.headers["user-agent"], new Date().toISOString()]
      );

      // ACTIVAR PLAN
      db.run(
        `UPDATE users SET plan = ?, plan_status = 'active', plan_started_at = CURRENT_TIMESTAMP WHERE id=?`,
        [selectedPlan.name, clinicId]
      );

      // EMAIL
      const resend = req.app.get("resend");
      if (resend) {
        await resend.emails.send({
          from: "ReActiva <onboarding@reactiva.com>",
          to: user.email,
          subject: "Pago confirmado",
          html: `<h2>Tu plan ${selectedPlan.name} está activo</h2>`
        });
      }

      res.json({ success: true, plan: selectedPlan.name });
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error capturando pago" });
  }
});

module.exports = router;