const express = require("express");
const router = express.Router();
const fetch = require("node-fetch"); 
const { procesarMensaje } = require("./bot");
const db = require("../database"); 

const VERIFY_TOKEN = "reactiva_verify_2024";

// ─────────────────── VERIFICACIÓN ───────────────────
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("Webhook verificado ✅");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// ─────────────────── MENSAJES ENTRANTES ───────────────────
router.post("/", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    // responder rápido a FB
    res.status(200).send("EVENT_RECEIVED");

    for (const entry of body.entry) {
      let events = entry.messaging || [];

      // Instagram Messenger
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === "messages" && change.value) {
            events.push({
              sender: { id: change.value.sender_id },
              message: { text: change.value.text },
              canal: "instagram"
            });
          }
        }
      }

      for (const event of events) {
        const senderId = event.sender?.id;
        const messageText = event.message?.text;
        const canal = event.canal || "facebook";

        if (!senderId || !messageText) continue;

        // procesar el mensaje en background
        procesarMensaje(messageText, { leadId: null, clinicId: 1, canal }, async (respuesta) => {
          try {
            const PAGE_TOKEN = process.env.PAGE_TOKEN;
            if (!PAGE_TOKEN) return console.warn("⚠️ PAGE_TOKEN no definido");
            const url = `https://graph.facebook.com/v25.0/${senderId}/messages?access_token=${PAGE_TOKEN}`;
            await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                messaging_type: "RESPONSE", 
                recipient: { id: senderId }, 
                message: { text: respuesta.texto } 
              }),
            });
          } catch (err) {
            console.error("Error enviando mensaje FB/IG:", err);
          }
        });
      }
    }
  } else {
    res.sendStatus(404);
  }
});

module.exports = router;