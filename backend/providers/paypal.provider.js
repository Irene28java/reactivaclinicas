// backend/providers/paypal.provider.js

const fetch = require("node-fetch");

const API = "https://api-m.paypal.com";

async function token() {
  const auth = Buffer.from(
    process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_SECRET
  ).toString("base64");

  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
    body: "grant_type=client_credentials"
  });

  return (await res.json()).access_token;
}

async function createOrder(amount) {
  const t = await token();

  const res = await fetch(`${API}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t}`
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: "EUR", value: amount } }]
    })
  });

  return res.json();
}

async function capture(orderID) {
  const t = await token();

  const res = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}` }
  });

  return res.json();
}

module.exports = { createOrder, capture };