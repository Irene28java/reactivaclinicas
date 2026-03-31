// backend/billing/billing.controller.js

const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const tenant = require("../middleware/tenant");

const billing = require("./billing.service");

router.post("/create-order", auth, tenant, async (req, res) => {
  const order = await billing.createCheckout(req.user, req.body.plan);
  res.json(order);
});

router.post("/capture", auth, tenant, async (req, res) => {
  try {
    await billing.confirmPayment({
      orderID: req.body.orderID,
      plan: req.body.plan,
      user: req.user
    });

    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;