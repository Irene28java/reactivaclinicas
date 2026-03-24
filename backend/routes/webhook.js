// routes/webhooks.js — Webhooks para FB Messenger, Instagram y canales externos

const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const { crearLead } = require('./leads');
const { procesarMensaje } = require('./bot');

// ─── FACEBOOK / MESSENGER / INSTAGRAM ────────────────────────────────────────

// Verificación del webhook (requerido por Meta)
router.get('/facebook', (req, res) => {
  const db = getDB();
  const verifyToken = db.prepare("SELECT valor FROM bot_config WHERE clave='verify_token'").get()?.valor || 'reactiva_verify_2024';
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Webhook FB] Verificación exitosa');
    return res.status(200).send(challenge);
  }
  res.status(403).json({ error: 'Token inválido' });
});

// Recepción de mensajes (Messenger + Instagram DM)
router.post('/facebook', async (req, res) => {
  const body = req.body;
  res.status(200).json({ status: 'ok' }); // Responder inmediatamente a Meta

  if (body.object !== 'page' && body.object !== 'instagram') return;

  const db = getDB();

  for (const entry of (body.entry || [])) {
    for (const event of (entry.messaging || entry.changes || [])) {

      // ── Messenger ──
      if (event.message && event.sender) {
        const senderId = event.sender.id;
        const texto    = event.message.text || '';
        const canal    = body.object === 'instagram' ? 'Instagram' : 'Messenger';

        // Guardar evento raw
        db.prepare('INSERT INTO webhook_events (canal, payload) VALUES (?, ?)')
          .run(canal, JSON.stringify(event));

        if (!texto.trim()) continue;

        // Buscar o crear lead
        let lead = db.prepare('SELECT * FROM leads WHERE external_id=?').get(senderId);
        if (!lead) {
          lead = crearLead({
            name: `Usuario ${canal} (${senderId.slice(-6)})`,
            message: texto,
            phone: '',
            servicio: '',
            canal,
            status: 'new',
            external_id: senderId
          });
          // Actualizar nombre si llegó más tarde (en una versión real haríamos GET al Graph API)
          notificarWS(req.app, { type: 'new_lead', lead });
        } else {
          // Actualizar mensaje
          db.prepare("UPDATE leads SET message=?, updated_at=datetime('now') WHERE id=?").run(texto, lead.id);
        }

        // Procesar respuesta del bot
        const respuesta = procesarMensaje(texto, { leadId: lead.id, canal });

        // Guardar mensajes
        db.prepare('INSERT INTO chat_mensajes (canal, lead_id, rol, contenido, external_id) VALUES (?,?,?,?,?)')
          .run(canal, lead.id, 'user', texto, senderId);
        db.prepare('INSERT INTO chat_mensajes (canal, lead_id, rol, contenido) VALUES (?,?,?,?)')
          .run(canal, lead.id, 'bot', respuesta.texto);

        // Enviar respuesta al canal (si hay token configurado)
        enviarRespuestaFB(req.app, senderId, respuesta.texto, canal);

        notificarWS(req.app, { type: 'new_message', canal, lead_id: lead.id, texto });
      }

      // ── Instagram Comments (básico) ──
      if (event.field === 'comments' && event.value) {
        const comment = event.value;
        if (!comment.text) continue;
        db.prepare('INSERT INTO webhook_events (canal, payload) VALUES (?, ?)')
          .run('Instagram', JSON.stringify(comment));
        const lead = crearLead({
          name: comment.from?.username || 'Usuario IG',
          message: comment.text,
          canal: 'Instagram',
          status: 'new',
          external_id: comment.id
        });
        notificarWS(req.app, { type: 'new_lead', lead });
      }
    }
  }
});

// ─── WHATSAPP (estructura básica — requiere Meta WABA) ────────────────────────
router.get('/whatsapp', (req, res) => {
  const db = getDB();
  const verifyToken = db.prepare("SELECT valor FROM bot_config WHERE clave='verify_token'").get()?.valor || 'reactiva_verify_2024';
  const mode = req.query['hub.mode'], token = req.query['hub.verify_token'], challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === verifyToken) return res.send(challenge);
  res.status(403).send('Forbidden');
});

router.post('/whatsapp', (req, res) => {
  const body = req.body;
  res.status(200).json({ status: 'ok' });
  const db = getDB();
  const entry = body.entry?.[0]?.changes?.[0]?.value;
  if (!entry?.messages?.length) return;
  const msg    = entry.messages[0];
  const from   = msg.from;
  const texto  = msg.text?.body || '';
  if (!texto.trim()) return;
  db.prepare('INSERT INTO webhook_events (canal, payload) VALUES (?,?)').run('WhatsApp', JSON.stringify(msg));
  let lead = db.prepare('SELECT * FROM leads WHERE external_id=?').get(from);
  if (!lead) {
    lead = crearLead({ name: `WhatsApp ${from.slice(-4)}`, message: texto, phone: from, canal: 'WhatsApp', status: 'new', external_id: from });
    notificarWS(req.app, { type: 'new_lead', lead });
  }
  const respuesta = procesarMensaje(texto, { leadId: lead.id, canal: 'WhatsApp' });
  db.prepare('INSERT INTO chat_mensajes (canal,lead_id,rol,contenido,external_id) VALUES(?,?,?,?,?)').run('WhatsApp',lead.id,'user',texto,from);
  db.prepare('INSERT INTO chat_mensajes (canal,lead_id,rol,contenido) VALUES(?,?,?,?)').run('WhatsApp',lead.id,'bot',respuesta.texto);
  // Aquí se enviaría la respuesta via API de WhatsApp Business
});

// ─── LEAD MANUAL (formulario web externo) ────────────────────────────────────
router.post('/lead', (req, res) => {
  const { name, phone, message, servicio, canal = 'web' } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const lead = crearLead({ name, phone, message, servicio, canal, status: 'new' });
    notificarWS(req.app, { type: 'new_lead', lead });
    res.status(201).json({ ok: true, lead_id: lead.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function notificarWS(app, data) {
  try {
    if (app.locals.wss) {
      app.locals.wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(JSON.stringify(data));
      });
    }
  } catch (e) { /* ignorar */ }
}

async function enviarRespuestaFB(app, recipientId, texto, canal) {
  const db = getDB();
  const tokenClave = canal === 'Instagram' ? 'ig_token' : 'fb_page_token';
  const token = db.prepare(`SELECT valor FROM bot_config WHERE clave=?`).get(tokenClave)?.valor;
  if (!token) return; // Sin token configurado

  const url = canal === 'Instagram'
    ? `https://graph.facebook.com/v25.0/me/messages?access_token=${token}`
    : `https://graph.facebook.com/v25.0/me/messages?access_token=${token}`;

  try {
    const fetch = (await import('node-fetch')).default;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text: texto } })
    });
  } catch (e) {
    console.error('[Webhook] Error enviando respuesta:', e.message);
  }
}

module.exports = router;
