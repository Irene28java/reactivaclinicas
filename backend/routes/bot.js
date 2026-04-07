// ─────────────────────────────────────────────
// BOT.JS — MOTOR VENTAS + CITAS + IA REAL
// ─────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const db = require('../database');
const { crearCita, obtenerSlibres } = require('./leads');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ─────────────────────────────────────────────
// HELPERS DB (promisificados)
// ─────────────────────────────────────────────
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
  });
}

// ─────────────────────────────────────────────
// NORMALIZAR TEXTO
// ─────────────────────────────────────────────
function normalizar(texto = '') {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// ─────────────────────────────────────────────
// DETECTAR INTENCIONES
// ─────────────────────────────────────────────
function detectarIntentoCita(texto) {
  return /cita|reservar|hora|cuando|manana|semana|disponible|turno/.test(normalizar(texto));
}

function detectarLeadCaliente(texto) {
  return /precio|urgente|dolor|cita|cuanto cuesta|presupuesto|me interesa/.test(normalizar(texto));
}

// ─────────────────────────────────────────────
// BUSCAR MEJOR TRIGGER EN DB
// ─────────────────────────────────────────────
async function buscarRespuestaDB(textLower) {
  const respuestas = await dbAll(
    `SELECT * FROM bot_respuestas WHERE activa = 1 ORDER BY prioridad DESC`
  );

  let mejorRespuesta = null;
  let mejorScore = 0;

  for (const r of respuestas) {
    if (!r.trigger || r.trigger === '__default__') continue;

    const triggers = r.trigger.split('|');
    for (const t of triggers) {
      const trigger = normalizar(t.trim());
      if (!trigger) continue;

      // Matching por palabra completa (más preciso)
      const regex = new RegExp(`\\b${trigger}\\b`);
      if (regex.test(textLower)) {
        const score = r.prioridad + trigger.length;
        if (score > mejorScore) {
          mejorScore = score;
          mejorRespuesta = r;
        }
      }
    }
  }

  return mejorRespuesta;
}

// ─────────────────────────────────────────────
// RECUPERAR HISTORIAL DEL LEAD
// ─────────────────────────────────────────────
async function obtenerHistorial(leadId, limite = 10) {
  if (!leadId) return [];
  const mensajes = await dbAll(
    `SELECT rol, contenido FROM chat_mensajes
     WHERE lead_id = ?
     ORDER BY id DESC LIMIT ?`,
    [leadId, limite]
  );
  return mensajes.reverse().map(m => ({
    role: m.rol === 'bot' ? 'assistant' : 'user',
    content: m.contenido
  }));
}

// ─────────────────────────────────────────────
// LLAMAR A CLAUDE (IA REAL)
// ─────────────────────────────────────────────
async function llamarIA(texto, historial = [], contextoClinica = '') {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no configurada');
  }

  const systemPrompt = `Eres el asistente virtual de ReActiva Clínica Dental, especialista en ventas y atención al paciente. Tu objetivo principal es CERRAR CITAS.

REGLAS ESTRICTAS:
- Responde SIEMPRE en español, de forma amigable y empática
- Máximo 3 frases por respuesta (sé conciso, esto es un chat)
- SIEMPRE intenta redirigir hacia agendar una cita o pedir datos de contacto
- Si el usuario muestra interés (precio, tratamiento, dolor), ofrece cita inmediatamente
- Usa emojis con moderación (máximo 1-2 por mensaje)
- No inventes precios si no los tienes; ofrece una consulta gratuita

SERVICIOS Y PRECIOS (usa solo estos):
- Blanqueamiento: 180€ (oferta este mes)
- Ortodoncia + blanqueamiento: desde 1.950€
- Financiación hasta 12 meses sin intereses
- Primera consulta: GRATUITA

${contextoClinica}

CIERRE DE VENTA: Cuando el usuario quiera una cita, pídele su nombre y teléfono para confirmar la reserva. No mandes a buscar slots tú solo; confirma primero los datos.

Responde en formato JSON con esta estructura exacta (sin markdown, sin bloques de código):
{"texto": "tu respuesta aquí", "categoria": "saludo|precios|citas|urgencias|info|cierre", "quickReplies": ["opción1", "opción2"]}`;

  const messages = [
    ...historial,
    { role: 'user', content: texto }
  ];

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text || '';

  // Parsear JSON de la respuesta
  const clean = rawText.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  return {
    texto: parsed.texto || '¿En qué más puedo ayudarte? 😊',
    categoria: parsed.categoria || 'default',
    quickReplies: Array.isArray(parsed.quickReplies) ? parsed.quickReplies : ['Pedir cita', 'Ver precios'],
    fuenteIA: true
  };
}

// ─────────────────────────────────────────────
// FLUJO DE CITAS (CALENDLY-STYLE)
// ─────────────────────────────────────────────
async function manejarCita(contexto) {
  try {
    const hoy = new Date();
    const manana = new Date(hoy);
    manana.setDate(hoy.getDate() + 1);
    const fechaStr = manana.toISOString().slice(0, 10);

    const libres = await obtenerSlibres(fechaStr, contexto.clinicId);

    if (!libres || !libres.length) {
      return {
        texto: 'No hay huecos mañana 😔 pero puedo buscarte el siguiente disponible. ¿Quieres que te llamen para confirmarlo?',
        categoria: 'citas',
        quickReplies: ['Ver otro día', 'Que me llamen']
      };
    }

    const slots = libres.slice(0, 3);
    return {
      texto: `¡Perfecto! 😁 Tengo estos huecos disponibles mañana:\n\n${slots.join(', ')}\n\n¿Te reservo uno?`,
      categoria: 'citas',
      quickReplies: slots,
      metadata: { fecha: fechaStr, slots }
    };

  } catch (e) {
    console.error('[manejarCita] Error:', e.message);
    return {
      texto: 'Hubo un problema buscando disponibilidad 😔 ¿Quieres que te llamemos para confirmarlo?',
      categoria: 'error',
      quickReplies: ['Que me llamen']
    };
  }
}

// ─────────────────────────────────────────────
// QUICK REPLIES POR CATEGORÍA
// ─────────────────────────────────────────────
function getQuickReplies(categoria) {
  const map = {
    saludo:     ['Pedir cita', 'Ver precios', 'Urgencia'],
    precios:    ['Pedir cita', 'Financiación'],
    citas:      ['Mañana', 'Esta semana'],
    urgencias:  ['Cita urgente hoy', 'Llamar ahora'],
    financiacion: ['Pedir cita', 'Más información'],
    info:       ['Pedir cita', 'Precios'],
    cierre:     ['Confirmar cita', 'Hablar con asesor'],
    despedida:  ['Pedir cita', 'Ver precios'],
    default:    ['Pedir cita', 'Ver precios']
  };
  return map[categoria] || ['Pedir cita'];
}

// ─────────────────────────────────────────────
// MOTOR PRINCIPAL
// ─────────────────────────────────────────────
async function procesarMensaje(texto, contexto = {}) {
  try {
    const textLower = normalizar(texto);

    // Marcar lead caliente (sin await para no bloquear)
    if (contexto.leadId && detectarLeadCaliente(texto)) {
      dbRun(`UPDATE leads SET status='hot' WHERE id=?`, [contexto.leadId]).catch(() => {});
    }

    // 1. Buscar trigger en DB (respuesta configurada)
    const respuestaDB = await buscarRespuestaDB(textLower);
    if (respuestaDB) {

      // Si la respuesta es de citas Y hay leadId → buscar slots reales
      if (respuestaDB.categoria === 'citas' && contexto.leadId) {
        return await manejarCita(contexto);
      }

      return {
        texto: respuestaDB.respuesta,
        categoria: respuestaDB.categoria,
        quickReplies: getQuickReplies(respuestaDB.categoria)
      };
    }

    // 2. Intención de cita detectada
    if (detectarIntentoCita(texto) && contexto.leadId) {
      return await manejarCita(contexto);
    }

    // 3. Fallback a IA real (Claude)
    const historial = await obtenerHistorial(contexto.leadId);
    return await llamarIA(texto, historial);

  } catch (e) {
    console.error('[procesarMensaje] Error:', e.message);
    return {
      texto: 'Hubo un error 😔 ¿Quieres hablar con un asesor directamente?',
      categoria: 'error',
      quickReplies: ['Hablar con asesor']
    };
  }
}

// ─────────────────────────────────────────────
// GUARDAR MENSAJE (helper sin duplicación)
// ─────────────────────────────────────────────
async function guardarMensaje(canal, leadId, rol, contenido) {
  if (!leadId) return;
  try {
    await dbRun(
      `INSERT INTO chat_mensajes (canal, lead_id, rol, contenido, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [canal, leadId, rol, contenido]
    );
  } catch (e) {
    console.error('[guardarMensaje] Error:', e.message);
  }
}

// ─────────────────────────────────────────────
// POST /mensaje — ENDPOINT PRINCIPAL
// ─────────────────────────────────────────────
router.post('/mensaje', async (req, res) => {
  try {
    const { texto, lead_id, canal = 'web', clinicId = 1 } = req.body;

    if (!texto || !texto.trim()) {
      return res.status(400).json({ error: 'Texto requerido' });
    }

    await guardarMensaje(canal, lead_id, 'user', texto.trim());

    const respuesta = await procesarMensaje(texto.trim(), {
      leadId: lead_id,
      clinicId
    });

    await guardarMensaje(canal, lead_id, 'bot', respuesta.texto);

    return res.json(respuesta);

  } catch (e) {
    console.error('[POST /mensaje] Error:', e.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────
// GET /historial/:leadId — HISTORIAL DE CHAT
// ─────────────────────────────────────────────
router.get('/historial/:leadId', async (req, res) => {
  try {
    const mensajes = await dbAll(
      `SELECT rol, contenido, created_at FROM chat_mensajes
       WHERE lead_id = ? ORDER BY id ASC`,
      [req.params.leadId]
    );
    res.json(mensajes);
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

// ─────────────────────────────────────────────
// CRUD RESPUESTAS BOT (admin panel)
// ─────────────────────────────────────────────
router.get('/respuestas', async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM bot_respuestas ORDER BY prioridad DESC`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

router.post('/respuestas', async (req, res) => {
  try {
    const { trigger, respuesta, categoria = 'general', prioridad = 5 } = req.body;

    if (!trigger || !respuesta) {
      return res.status(400).json({ error: 'trigger y respuesta son obligatorios' });
    }

    // Verificar duplicado de trigger
    const existente = await dbGet(
      `SELECT id FROM bot_respuestas WHERE trigger = ? AND activa = 1`,
      [trigger]
    );
    if (existente) {
      return res.status(409).json({ error: 'Ya existe una respuesta con ese trigger', id: existente.id });
    }

    const result = await dbRun(
      `INSERT INTO bot_respuestas (trigger, respuesta, categoria, prioridad, activa)
       VALUES (?, ?, ?, ?, 1)`,
      [trigger, respuesta, categoria, prioridad]
    );
    res.json({ id: result.lastID });

  } catch (e) {
    res.status(500).json({ error: 'Insert error' });
  }
});

router.put('/respuestas/:id', async (req, res) => {
  try {
    const { trigger, respuesta, activa, prioridad } = req.body;
    await dbRun(
      `UPDATE bot_respuestas SET trigger=?, respuesta=?, activa=?, prioridad=? WHERE id=?`,
      [trigger, respuesta, activa ? 1 : 0, prioridad, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Update error' });
  }
});

router.delete('/respuestas/:id', async (req, res) => {
  try {
    await dbRun(`DELETE FROM bot_respuestas WHERE id=?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Delete error' });
  }
});

// ─────────────────────────────────────────────
module.exports = router;
module.exports.procesarMensaje = procesarMensaje;