// routes/bot.js — Motor de respuestas del bot (controlado manualmente)

const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const { crearLead, crearCita, obtenerSlibres } = require('./leads');

// ─── MOTOR DE RESPUESTAS ─────────────────────────────────────────────────────

function procesarMensaje(texto, contexto = {}) {
  const db = getDB();
  const textLower = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Buscar respuesta por trigger en la DB
  const respuestas = db.prepare(`
    SELECT * FROM bot_respuestas
    WHERE activa = 1
    ORDER BY prioridad DESC
  `).all();

  let mejorRespuesta = null;
  let mejorScore = 0;

  for (const r of respuestas) {
    if (r.trigger === '__default__') continue;
    const triggers = r.trigger.split('|');
    for (const t of triggers) {
      const tNorm = t.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (textLower.includes(tNorm)) {
        const score = r.prioridad + tNorm.length;
        if (score > mejorScore) {
          mejorScore = score;
          mejorRespuesta = r;
        }
      }
    }
  }

  // 2. Lógica especial: detección de cita con fecha/hora
  const citaIntent = detectarIntentoCita(texto);
  if (citaIntent && contexto.leadId) {
    return manejarCita(citaIntent, contexto);
  }

  // 3. Respuesta encontrada
  if (mejorRespuesta) {
    return {
      texto: mejorRespuesta.respuesta,
      categoria: mejorRespuesta.categoria,
      quickReplies: getQuickReplies(mejorRespuesta.categoria)
    };
  }

  // 4. Default
  const defaultResp = respuestas.find(r => r.trigger === '__default__');
  return {
    texto: defaultResp ? defaultResp.respuesta : 'Gracias por escribirnos. ¿En qué puedo ayudarte?',
    categoria: 'default',
    quickReplies: ['Precios', 'Pedir cita', 'Urgencias', '¿Dónde estáis?']
  };
}

function detectarIntentoCita(texto) {
  const tl = texto.toLowerCase();
  const quiereCita = /cita|reservar|turno|hora|disponible|cuando|mañana|pasado|semana/i.test(texto);
  if (!quiereCita) return null;

  // Extraer hora si se menciona
  const horaMatch = texto.match(/(\d{1,2})[:\s]?(\d{2})?\s*(am|pm|h)?/i);
  const hora = horaMatch ? formatearHora(horaMatch) : null;

  // Extraer fecha aproximada
  const manana = /mañana/i.test(texto);
  const pasado = /pasado\s*mañana/i.test(texto);

  return { quiereCita: true, hora, manana, pasado };
}

function formatearHora(match) {
  let h = parseInt(match[1]);
  const m = match[2] ? parseInt(match[2]) : 0;
  if (match[3] === 'pm' && h < 12) h += 12;
  if (h >= 9 && h <= 20) {
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  return null;
}

function manejarCita(intent, contexto) {
  const db = getDB();
  const hoy = new Date();
  let fecha;

  if (intent.pasado) {
    const d = new Date(hoy); d.setDate(d.getDate() + 2);
    fecha = d.toISOString().slice(0, 10);
  } else {
    const d = new Date(hoy); d.setDate(d.getDate() + 1);
    fecha = d.toISOString().slice(0, 10);
  }

  const libres = obtenerSlibres(fecha);

  if (!libres.length) {
    return {
      texto: `Para el ${formatFecha(fecha)} no tenemos slots disponibles. ¿Te vendría bien el día siguiente? 😊`,
      categoria: 'citas',
      quickReplies: ['Sí, el día siguiente', 'Ver más fechas', 'Llámame vosotros']
    };
  }

  const horasSugeridas = libres.slice(0, 3);
  const texto = `Para el ${formatFecha(fecha)} tenemos disponibilidad a las: ${horasSugeridas.join(', ')}.\n\n¿Cuál te viene mejor? 😊`;

  return {
    texto,
    categoria: 'citas',
    quickReplies: horasSugeridas,
    metadata: { fecha, slotsLibres: libres }
  };
}

function getQuickReplies(categoria) {
  const mapa = {
    saludo:      ['Pedir cita', 'Ver precios', '¿Dónde estáis?', 'Urgencias'],
    precios:     ['Pedir cita', 'Financiación', 'Otros tratamientos'],
    citas:       ['Mañana por la mañana', 'Mañana por la tarde', 'Esta semana'],
    urgencias:   ['Llamar ahora', 'Pedir cita urgente'],
    info:        ['Pedir cita', 'Ver precios'],
    financiacion:['Pedir cita', 'Ver tratamientos'],
    despedida:   [],
    default:     ['Ver precios', 'Pedir cita', 'Urgencias']
  };
  return mapa[categoria] || ['Ver precios', 'Pedir cita'];
}

function formatFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ─── RUTAS API ───────────────────────────────────────────────────────────────

// POST /api/bot/mensaje — Chat web
router.post('/mensaje', (req, res) => {
  const { texto, lead_id, canal = 'web' } = req.body;
  if (!texto || !texto.trim()) {
    return res.status(400).json({ error: 'Texto requerido' });
  }

  const db = getDB();

  // Guardar mensaje del usuario
  if (lead_id) {
    db.prepare('INSERT INTO chat_mensajes (canal, lead_id, rol, contenido) VALUES (?, ?, ?, ?)')
      .run(canal, lead_id, 'user', texto.trim());
  }

  // Procesar
  const respuesta = procesarMensaje(texto.trim(), { leadId: lead_id, canal });

  // Guardar respuesta del bot
  if (lead_id) {
    db.prepare('INSERT INTO chat_mensajes (canal, lead_id, rol, contenido) VALUES (?, ?, ?, ?)')
      .run(canal, lead_id, 'bot', respuesta.texto);
  }

  res.json(respuesta);
});

// GET /api/bot/respuestas — Lista todas las respuestas
router.get('/respuestas', (req, res) => {
  const db = getDB();
  const items = db.prepare('SELECT * FROM bot_respuestas ORDER BY categoria, prioridad DESC').all();
  res.json(items);
});

// POST /api/bot/respuestas — Crear respuesta
router.post('/respuestas', (req, res) => {
  const { trigger, respuesta, categoria = 'general', prioridad = 5 } = req.body;
  if (!trigger || !respuesta) return res.status(400).json({ error: 'Trigger y respuesta requeridos' });
  const db = getDB();
  const result = db.prepare('INSERT INTO bot_respuestas (trigger, respuesta, categoria, prioridad) VALUES (?, ?, ?, ?)')
    .run(trigger, respuesta, categoria, prioridad);
  res.json({ id: result.lastInsertRowid, ok: true });
});

// PUT /api/bot/respuestas/:id — Editar respuesta
router.put('/respuestas/:id', (req, res) => {
  const { trigger, respuesta, activa, prioridad } = req.body;
  const db = getDB();
  db.prepare('UPDATE bot_respuestas SET trigger=?, respuesta=?, activa=?, prioridad=? WHERE id=?')
    .run(trigger, respuesta, activa ? 1 : 0, prioridad, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/bot/respuestas/:id
router.delete('/respuestas/:id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM bot_respuestas WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// GET/PUT /api/bot/config
router.get('/config', (req, res) => {
  const db = getDB();
  const rows = db.prepare('SELECT clave, valor FROM bot_config').all();
  const config = {};
  rows.forEach(r => { config[r.clave] = r.valor; });
  res.json(config);
});

router.put('/config', (req, res) => {
  const db = getDB();
  const update = db.prepare('UPDATE bot_config SET valor=?, updated_at=datetime(\'now\') WHERE clave=?');
  const updateMany = db.transaction((data) => {
    for (const [clave, valor] of Object.entries(data)) {
      update.run(String(valor), clave);
    }
  });
  updateMany(req.body);
  res.json({ ok: true });
});

module.exports = router;
module.exports.procesarMensaje = procesarMensaje;
