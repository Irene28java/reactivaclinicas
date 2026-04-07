//backend>route>webhook.js
const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const db = require("../database");
const { procesarMensaje } = require("./bot");

// ──────────────────────────────
// CONFIGconst BACKEND_URL = "https://reactivaclinicas-production.up.railway.app";

document.addEventListener("DOMContentLoaded", function () {
    const chatDemo  = document.getElementById("chatDemo");
    const chatInput = document.getElementById("chatInput");
    if (!chatInput) return;

    // ID único por sesión para que el bot recuerde el contexto
    const sessionId = "web_" + Math.random().toString(36).substr(2, 9);

    setTimeout(() => {
        const welcome = document.createElement("div");
        welcome.className = "chat-message bot";
        welcome.textContent = "Hola 👋 ¿En qué podemos ayudarte hoy?";
        chatDemo.appendChild(welcome);
    }, 800);

    chatInput.addEventListener("keypress", async function (e) {
        if (e.key !== "Enter" || chatInput.value.trim() === "") return;

        const userText  = chatInput.value.trim();
        chatInput.value = "";

        // Mensaje del usuario
        const userMsg = document.createElement("div");
        userMsg.className   = "chat-message user";
        userMsg.textContent = userText;
        chatDemo.appendChild(userMsg);
        chatDemo.scrollTop = chatDemo.scrollHeight;

        // Indicador de escritura
        const typing = document.createElement("div");
        typing.className   = "chat-message bot";
        typing.textContent = "...";
        chatDemo.appendChild(typing);
        chatDemo.scrollTop = chatDemo.scrollHeight;

        try {
            const res  = await fetch(`${BACKEND_URL}/api/chat`, {
                method : "POST",
                headers: { "Content-Type": "application/json" },
                body   : JSON.stringify({ message: userText, sessionId })
            });
            const data = await res.json();
            typing.textContent = data.reply || "Gracias por tu mensaje 🙌";
        } catch (err) {
            typing.textContent = "Ha habido un problema de conexión. Inténtalo de nuevo 😊";
            console.error("Error chat:", err);
        }

        chatDemo.scrollTop = chatDemo.scrollHeight;
    });
});
// ──────────────────────────────
const VERIFY_TOKEN = "reactiva_verify_2024";

// ──────────────────────────────
// 1. META WEBHOOK (FACEBOOK + INSTAGRAM)
// ──────────────────────────────

// ✅ Verificación
router.get("/meta", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Meta Webhook verificado ✅");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// ✅ Recepción de mensajes
router.post("/meta", async (req, res) => {
  const body = req.body;

  if (body.object !== "page") return res.sendStatus(404);

  res.status(200).send("EVENT_RECEIVED");

  for (const entry of body.entry) {
    let events = entry.messaging || [];

    // Instagram
    if (entry.changes) {
      for (const change of entry.changes) {
        if (change.field === "messages" && change.value) {
          const msg = change.value;
          events.push({
            sender: { id: msg.sender_id },
            message: { text: msg.text || "", attachments: msg.attachments || [] },
            canal: "instagram"
          });
        }
      }
    }

    for (const event of events) {
      const senderId = event.sender?.id;
      const messageText = event.message?.text || "";
      const attachments = event.message?.attachments || [];
      const canal = event.canal || "facebook";

      if (!senderId) continue;

      const clinicId = 1;

      try {
        const lead = await db.getOrCreateLead(senderId, clinicId);

        await db.saveMessage({
          lead_id: lead.id,
          text: messageText,
          from: "user",
          canal,
          attachments
        });

        global.io?.to("clinic_" + clinicId).emit("nuevo_mensaje", {
          leadId: lead.id,
          text: messageText,
          from: "user"
        });

        procesarMensaje(
          messageText,
          { leadId: lead.id, clinicId, canal, attachments },
          async (respuesta) => {
            await db.saveMessage({
              lead_id: lead.id,
              text: respuesta.texto,
              from: "bot"
            });

            global.io?.to("clinic_" + clinicId).emit("nuevo_mensaje", {
              leadId: lead.id,
              text: respuesta.texto,
              from: "bot"
            });

            await fetch(
              `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  messaging_type: "RESPONSE",
                  recipient: { id: senderId },
                  message: { text: respuesta.texto }
                })
              }
            );
          }
        );

      } catch (err) {
        console.error("META ERROR:", err);
      }
    }
  }
});

// ──────────────────────────────
// 2. PAYPAL WEBHOOK
// ──────────────────────────────
router.post("/paypal", async (req, res) => {
  try {
    const event = req.body;

    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {

      const capture = event.resource;
      const orderID = capture.supplementary_data.related_ids.order_id;
      const amount = Number(capture.amount.value);

      db.get(`SELECT id FROM payments WHERE order_id=?`, [orderID], (err, row) => {
        if (row) return res.sendStatus(200);

        db.run(`
          INSERT INTO payments (order_id, amount, created_at)
          VALUES (?, ?, ?)
        `, [orderID, amount, new Date().toISOString()]);

        console.log("✅ Pago PayPal registrado:", orderID);
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("PAYPAL WEBHOOK ERROR:", err);
    res.sendStatus(500);
  }
});

// ──────────────────────────────
// 3. LEMONSQUEEZY WEBHOOK
// ──────────────────────────────
router.post("/lemon", async (req, res) => {
  try {
    const event = req.body;

    if (event.meta?.event_name === "order_created") {

      const data = event.data;
      const email = data.attributes.user_email;
      const amount = data.attributes.total / 100;

      db.get(`SELECT id FROM users WHERE email=?`, [email], (err, user) => {

        if (!user) return res.sendStatus(200);

        db.run(`
          UPDATE users
          SET plan='PREMIUM',
              plan_status='active',
              plan_started_at=CURRENT_TIMESTAMP
          WHERE id=?
        `, [user.id]);

        db.run(`
          INSERT INTO payments (clinic_id, plan, amount, created_at)
          VALUES (?, ?, ?, ?)
        `, [user.id, "PREMIUM", amount, new Date().toISOString()]);

        console.log("✅ Lemon pago activado para:", email);
      });
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("LEMON WEBHOOK ERROR:", err);
    res.sendStatus(500);
  }
});

module.exports = router;