// ─────────────────────────────────────────────
// BOT.JS — MOTOR COMPLETO DE VENTAS + CITAS
// ─────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const db = require('../database');
const { crearCita, obtenerSlibres } = require('./leads');

// ─────────────────────────────────────────────
// NORMALIZADOR
// ─────────────────────────────────────────────
function normalizar(texto = "") {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// ─────────────────────────────────────────────
// DETECTAR INTENCIONES
// ─────────────────────────────────────────────
function detectarIntentoCita(texto) {
  const t = normalizar(texto);

  const quiere = /cita|reservar|hora|cuando|mañana|semana|disponible/.test(t);
  if (!quiere) return null;

  return { quiereCita: true };
}

function detectarLeadCaliente(texto) {
  const t = normalizar(texto);
  return /precio|urgente|dolor|cita|cuanto cuesta/.test(t);
}

// ─────────────────────────────────────────────
// MOTOR PRINCIPAL (ASYNC)
// ─────────────────────────────────────────────
function procesarMensaje(texto, contexto = {}) {

  return new Promise((resolve) => {

    const textLower = normalizar(texto);

    // 🔥 MARCAR LEAD CALIENTE
    if (contexto.leadId && detectarLeadCaliente(texto)) {
      db.run(`UPDATE leads SET status='hot' WHERE id=?`, [contexto.leadId]);
    }

    // 🔍 BUSCAR RESPUESTAS EN DB
    db.all(
      `SELECT * FROM bot_respuestas WHERE activa = 1 ORDER BY prioridad DESC`,
      [],
      async (err, respuestas) => {

        let mejorRespuesta = null;
        let mejorScore = 0;

        if (respuestas) {
          for (const r of respuestas) {

            if (r.trigger === '__default__') continue;

            const triggers = r.trigger.split('|');

            for (const t of triggers) {
              const trigger = normalizar(t.trim());

              if (textLower.includes(trigger)) {
                const score = r.prioridad + trigger.length;

                if (score > mejorScore) {
                  mejorScore = score;
                  mejorRespuesta = r;
                }
              }
            }
          }
        }

        // ─────────────────────────────
        // 🎯 FLUJO DE VENTA → CITA
        // ─────────────────────────────
        const citaIntent = detectarIntentoCita(texto);

        if (citaIntent && contexto.leadId) {
          const resp = await manejarCita(contexto);
          return resolve(resp);
        }

        // ─────────────────────────────
        // RESPUESTA DB
        // ─────────────────────────────
        if (mejorRespuesta) {
          return resolve({
            texto: mejorRespuesta.respuesta,
            categoria: mejorRespuesta.categoria,
            quickReplies: getQuickReplies(mejorRespuesta.categoria)
          });
        }

        // ─────────────────────────────
        // DEFAULT (VENTA)
        // ─────────────────────────────
        return resolve({
          texto: "Perfecto 😊 Cuéntame, ¿buscas información o quieres pedir cita directamente?",
          categoria: "default",
          quickReplies: ["Ver precios", "Pedir cita", "Urgencia"]
        });

      }
    );

  });
}

// ─────────────────────────────────────────────
// 📅 FLUJO TIPO CALENDLY (CIERRE AUTOMÁTICO)
// ─────────────────────────────────────────────
async function manejarCita(contexto) {

  const hoy = new Date();
  const fecha = new Date(hoy);
  fecha.setDate(hoy.getDate() + 1);

  const fechaStr = fecha.toISOString().slice(0, 10);

  const libres = await obtenerSlibres(fechaStr, contexto.clinicId);

  if (!libres || !libres.length) {
    return {
      texto: "No hay huecos mañana 😔 pero puedo buscarte el siguiente disponible",
      categoria: "citas",
      quickReplies: ["Ver otro día", "Que me llamen"]
    };
  }

  return {
    texto: `Tengo huecos disponibles mañana:\n\n${libres.slice(0,3).join(", ")}\n\n¿Te reservo uno?`,
    categoria: "citas",
    quickReplies: libres.slice(0,3),
    metadata: { fecha: fechaStr }
  };
}

// ─────────────────────────────────────────────
// QUICK REPLIES (VENTAS)
// ─────────────────────────────────────────────
function getQuickReplies(cat) {
  const map = {
    saludo: ["Pedir cita", "Precios", "Urgencia"],
    precios: ["Pedir cita", "Financiación"],
    citas: ["Mañana", "Esta semana"],
    urgencias: ["Cita urgente", "Llamar"],
    default: ["Pedir cita", "Precios"]
  };
  return map[cat] || ["Pedir cita"];
}

// ─────────────────────────────────────────────
// API CHAT (USADA POR TU WIDGET)
// ─────────────────────────────────────────────
router.post('/mensaje', async (req, res) => {

  const { texto, lead_id, canal = "web", clinicId = 1 } = req.body;

  if (!texto) {
    return res.status(400).json({ error: "Texto requerido" });
  }

  // 🧠 GUARDAR MENSAJE USER
  if (lead_id) {
    db.run(
      `INSERT INTO chat_mensajes (canal, lead_id, rol, contenido) VALUES (?,?,?,?)`,
      [canal, lead_id, 'user', texto]
    );
  }

  // 🤖 PROCESAR
  const respuesta = await procesarMensaje(texto, {
    leadId: lead_id,
    clinicId
  });

  // 🧠 GUARDAR RESPUESTA BOT
  if (lead_id) {
    db.run(
      `INSERT INTO chat_mensajes (canal, lead_id, rol, contenido) VALUES (?,?,?,?)`,
      [canal, lead_id, 'bot', respuesta.texto]
    );
  }

  res.json(respuesta);
});

// ─────────────────────────────────────────────
// CRUD RESPUESTAS (ADMIN PANEL)
// ─────────────────────────────────────────────
router.get('/respuestas', (req, res) => {
  db.all(`SELECT * FROM bot_respuestas ORDER BY prioridad DESC`, [], (err, rows) => {
    res.json(rows || []);
  });
});

router.post('/respuestas', (req, res) => {
  const { trigger, respuesta, categoria = "general", prioridad = 5 } = req.body;

  db.run(
    `INSERT INTO bot_respuestas (trigger, respuesta, categoria, prioridad, activa)
     VALUES (?,?,?,?,1)`,
    [trigger, respuesta, categoria, prioridad],
    function() {
      res.json({ id: this.lastID });
    }
  );
});

router.put('/respuestas/:id', (req, res) => {
  const { trigger, respuesta, activa, prioridad } = req.body;

  db.run(
    `UPDATE bot_respuestas SET trigger=?, respuesta=?, activa=?, prioridad=? WHERE id=?`,
    [trigger, respuesta, activa ? 1 : 0, prioridad, req.params.id],
    () => res.json({ ok: true })
  );
});

router.delete('/respuestas/:id', (req, res) => {
  db.run(`DELETE FROM bot_respuestas WHERE id=?`, [req.params.id]);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
module.exports = router;
module.exports.procesarMensaje = procesarMensaje;