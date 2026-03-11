// backend/routes/pagos.js
const express      = require("express");
const router       = express.Router();
const db           = require("../database");
const auth         = require("../middleware/auth");
const paypalClient = require("../PayPal"); // ← ajusta si tu archivo se llama diferente
const paypal       = require("@paypal/checkout-server-sdk");

// ── Crear orden de PayPal ──
router.post("/create-order", auth, async (req, res) => {
  const { plan, amount } = req.body;

  if (!amount || !plan) {
    return res.status(400).json({ error: "Faltan datos: amount y plan son obligatorios" });
  }

  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer("return=representation");
  request.requestBody({
    intent: "CAPTURE",
    purchase_units: [{
      amount: { currency_code: "EUR", value: amount.toString() },
      description: `ReActiva Clínicas — Plan ${plan}`
    }]
  });

  try {
    const order = await paypalClient.execute(request);
    res.json({ id: order.result.id });
  } catch (err) {
    console.error("PayPal create-order error:", err);
    res.status(500).json({ error: "Error al crear la orden de PayPal" });
  }
});

// ── Capturar pago y guardar en BD ──
router.post("/capture-order", auth, async (req, res) => {
  const { orderID, plan, amount } = req.body;

  if (!orderID || !plan || !amount) {
    return res.status(400).json({ error: "Faltan datos: orderID, plan y amount son obligatorios" });
  }

  const request = new paypal.orders.OrdersCaptureRequest(orderID);
  request.requestBody({});

  try {
    const capture = await paypalClient.execute(request);
    if (capture.result.status !== "COMPLETED") {
      return res.status(400).json({ error: `Pago no completado. Estado: ${capture.result.status}` });
    }

    db.run(
      `INSERT INTO pagos (clinic_id, email, amount, plan, paypal_order_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, req.user.email, amount, plan, orderID, new Date().toISOString()],
      function(err) {
        if (err) return res.status(500).json({ error: "Pago capturado pero error guardando en BD" });
        res.json({ success: true, id: this.lastID });
      }
    );
  } catch (err) {
    console.error("PayPal capture error:", err);
    res.status(500).json({ error: "Error al capturar el pago de PayPal" });
  }
});

// ── Obtener pagos de la clínica autenticada ──
router.get("/", auth, (req, res) => {
  db.all(
    `SELECT id, email, amount, plan, paypal_order_id, created_at
     FROM pagos WHERE clinic_id = ? ORDER BY id DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Error cargando pagos" });
      res.json(rows);
    }
  );
});

module.exports = router;