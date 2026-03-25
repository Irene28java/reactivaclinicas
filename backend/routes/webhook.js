// backend/routes/webhook.js
const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const { procesarMensaje } = require("./bot");
const db = require("../database");

const VERIFY_TOKEN = "reactiva_verify_2024";

// ───────── VERIFICACIÓN DEL WEBHOOK ─────────
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado ✅");
    return res.status(200).send(challenge);
  } else {
    console.warn("Webhook no verificado ❌");
    return res.sendStatus(403);
  }
});

// ───────── RECIBIR MENSAJES ─────────
router.post("/", async (req, res) => {
  const body = req.body;

  if (body.object !== "page") return res.sendStatus(404);

  res.status(200).send("EVENT_RECEIVED"); // responder rápido a Meta

  for (const entry of body.entry) {
    let events = entry.messaging || [];

    // ───── Instagram messages (IG DM) ─────
    if (entry.changes) {
      for (const change of entry.changes) {
        if (change.field === "messages" && change.value) {
          const msg = change.value;
          events.push({
            sender: { id: msg.sender_id },
            message: { text: msg.text || null, attachments: msg.attachments || [] },
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

      if (!senderId && !messageText && !attachments.length) continue;

      const clinicId = 1; // tu clínica por defecto

      // ───── CREAR O BUSCAR LEAD ─────
      const lead = await db.getOrCreateLead(senderId, clinicId);

      // ───── GUARDAR MENSAJE DEL USUARIO ─────
      await db.saveMessage({
        lead_id: lead.id,
        text: messageText,
        from: "user",
        canal,
        attachments
      });

      // ───── ENVIAR AL PANEL EN TIEMPO REAL ─────
      global.io.to("clinic_" + clinicId).emit("nuevo_mensaje", {
        leadId: lead.id,
        text: messageText,
        from: "user",
        attachments
      });

      // ───── PROCESAR MENSAJE CON EL BOT ─────
      procesarMensaje(
        messageText,
        { leadId: lead.id, clinicId, canal, attachments },
        async (respuesta) => {
          try {
            // Guardar respuesta del bot en DB
            await db.saveMessage({
              lead_id: lead.id,
              text: respuesta.texto,
              from: "bot"
            });

            // Emitir respuesta al panel
            global.io.to("clinic_" + clinicId).emit("nuevo_mensaje", {
              leadId: lead.id,
              text: respuesta.texto,
              from: "bot"
            });

            // ───── ENVIAR RESPUESTA AL USUARIO ─────
            const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;

            await fetch(
              `https://graph.facebook.com/v25.0/me/messages?access_token=${PAGE_TOKEN}`,
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
          } catch (err) {
            console.error("Error enviando mensaje:", err);
          }
        }
      );
    }
  }
});

module.exports = router;