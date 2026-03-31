const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const db = require("../database");

const auth = require("../middleware/auth");
const antiFraud = require("../middleware/antiFraud");
const planCheck = require("../middleware/planCheck");

const PAYPAL_API = "https://api-m.paypal.com";

// ──────────────────────────────
// PLANES (SOURCE OF TRUTH)
// ──────────────────────────────
const PLANES = {
  BASIC: { price: 169, renewal: 29, name: "BASIC" },
  PREMIUM: { price: 299, renewal: 49, name: "PREMIUM" }
};

// ──────────────────────────────
// MIDDLEWARE GLOBAL ROUTE
// ──────────────────────────────
router.use(auth);
router.use(antiFraud);

// ──────────────────────────────
// PAYPAL TOKEN
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
// CREATE ORDER
// ──────────────────────────────
router.post("/create-order", async (req, res) => {
  try {
    const { plan } = req.body;
    const selectedPlan = PLANES[plan];

    if (!selectedPlan) {
      return res.status(400).json({ error: "Plan inválido" });
    }

    const accessToken = await getAccessToken();

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
            amount: {
              currency_code: "EUR",
              value: selectedPlan.price
            }
          }
        ]
      })
    });

    const data = await order.json();
    res.json(data);

  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Error creando orden" });
  }
});

// ──────────────────────────────
// CAPTURE ORDER (SaaS SAFE)
// ──────────────────────────────
router.post("/capture-order", async (req, res) => {
  try {
    const { orderID, plan } = req.body;
    const selectedPlan = PLANES[plan];

    if (!selectedPlan) {
      return res.status(400).json({ error: "Plan inválido" });
    }

    const accessToken = await getAccessToken();

    const capture = await fetch(
      `${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const result = await capture.json();

    if (result.status !== "COMPLETED") {
      return res.status(400).json({ error: "Pago no completado" });
    }

    const paidAmount = Number(
      result.purchase_units[0].payments.captures[0].amount.value
    );

    const userId = req.user.id;

    // ──────────────────────────────
    // VALIDAR MONTO (ANTI FRAUDE)
    // ──────────────────────────────
    if (paidAmount !== selectedPlan.price) {
      return res.status(400).json({
        error: "Monto inválido (posible manipulación)"
      });
    }

    // ──────────────────────────────
    // EVITAR DUPLICADOS
    // ──────────────────────────────
    db.get(
      `SELECT id FROM payments WHERE order_id=?`,
      [orderID],
      (err, row) => {
        if (row) {
          return res.json({ success: true, already_processed: true });
        }

        // ──────────────────────────────
        // GUARDAR PAGO
        // ──────────────────────────────
        db.run(
          `INSERT INTO payments
          (clinic_id, plan, amount, order_id, ip, user_agent, created_at)
          VALUES (?,?,?,?,?,?,?)`,
          [
            userId,
            selectedPlan.name,
            paidAmount,
            orderID,
            req.ip,
            req.headers["user-agent"],
            new Date().toISOString()
          ]
        );

        // ──────────────────────────────
        // ACTIVAR PLAN (SaaS CORE)
        // ──────────────────────────────
        db.run(
          `UPDATE users
           SET plan = ?, plan_status = 'active', plan_started_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [selectedPlan.name, userId]
        );

        res.json({
          success: true,
          plan: selectedPlan.name
        });
      }
    );

  } catch (err) {
    console.error("CAPTURE ERROR:", err);
    res.status(500).json({ error: "Error capturando pago" });
  }
});

module.exports = router;