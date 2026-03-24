const express = require("express");
const router = express.Router();
const fetch = require("node-fetch"); // para responder a FB/IG
const { procesarMensaje } = require("./bot"); // tu motor del bot
const db = require("../database"); // tu DB si necesitas logs

const VERIFY_TOKEN = "reactiva_verify_2024"; // mismo que usarás en FB App

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

  // Validación de evento de Messenger/IG
  if (body.object === "page") {
    body.entry.forEach(async (entry) => {
      const messagingEvents = entry.messaging || entry.changes || [];

      for (const event of messagingEvents) {
        let senderId, messageText, canal;

        // Messenger
        if (event.message) {
          senderId = event.sender.id;
          messageText = event.message.text;
          canal = "facebook";
        }
        // Instagram
        else if (event.field === "messages") {
          senderId = event.value.sender_id;
          messageText = event.value.text;
          canal = "instagram";
        }

        if (messageText && senderId) {
          // Llamar a tu bot
          procesarMensaje(
            messageText,
            { leadId: null, clinicId: 1, canal },
            async (respuesta) => {
              try {
                // Responder usando Graph API
                const PAGE_TOKEN = process.env.PAGE_TOKEN; // tu token de página
                const url = `https://graph.facebook.com/v17.0/${senderId}/messages?access_token=${PAGE_TOKEN}`;
                await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ messaging_type: "RESPONSE", recipient: { id: senderId }, message: { text: respuesta.texto } }),
                });
              } catch (e) {
                console.error("Error enviando mensaje a FB/IG", e);
              }
            }
          );
        }
      }
    });
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

module.exports = router;