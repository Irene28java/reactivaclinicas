//backend>providers>paypal.services.js 
const fetch = require("node-fetch");

const API = "https://api-m.paypal.com";

// 🔐 Cachear token (evita pedirlo cada vez)
let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const auth = Buffer.from(
    process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_SECRET
  ).toString("base64");

  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error("PayPal auth error: " + err);
  }

  const data = await res.json();

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  return cachedToken;
}

// 🧠 Crear orden segura
async function createOrder({ amount, userId, plan }) {
  const token = await getToken();

  const res = await fetch(`${API}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: "EUR",
          value: amount.toFixed(2)
        },
        custom_id: `${userId}|${plan}`, // 🔐 antifraude
        description: `ReActiva - ${plan}`
      }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error("PayPal create error: " + err);
  }

  return res.json();
}

// 💳 Capturar pago
async function capture(orderID) {
  const token = await getToken();

  const res = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error("PayPal capture error: " + err);
  }

  return res.json();
}

module.exports = { createOrder, capture };