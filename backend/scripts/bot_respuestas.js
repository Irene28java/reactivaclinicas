// ─────────────────────────────────────────────
// bot_respuestas.js — SEED INTELIGENTE CON ANTI-DUPLICADOS
// Ejecutar: node backend/scripts/bot_respuestas.js
// ─────────────────────────────────────────────

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./reactiva.db');

// ─────────────────────────────────────────────
// RESPUESTAS (orientadas a CIERRE DE VENTA)
// Orden de prioridad: urgencias > citas > precios > info > saludo
// ─────────────────────────────────────────────
const respuestas = [

  // URGENCIAS (prioridad máxima)
  {
    trigger: 'dolor|urgente|muela|inflamado|sangra|emergencia|ayuda|se me cayo',
    respuesta: '¡Vaya, eso suena urgente! 😟 Hacemos todo lo posible por verte HOY mismo.\n\n¿Puedes darme tu nombre y teléfono? Te llamamos en menos de 10 minutos para confirmarte hora.',
    categoria: 'urgencias',
    prioridad: 30
  },

  // CITAS (prioridad alta)
  {
    trigger: 'cita|reservar|turno|hora disponible|pedir cita|quiero cita|necesito cita',
    respuesta: '¡Perfecto! 😁 Vamos a encontrarte el mejor horario.\n\n¿Qué día te viene mejor, esta semana o la siguiente?',
    categoria: 'citas',
    prioridad: 25
  },
  {
    trigger: 'manana|mañana|hoy|esta semana|esta tarde|esta mañana',
    respuesta: '¡Déjame mirar disponibilidad ahora mismo! 🗓️\n\n¿A qué nombre reservamos y cuál es tu teléfono de contacto?',
    categoria: 'citas',
    prioridad: 22
  },

  // PRECIOS / TRATAMIENTOS (prioridad media-alta)
  {
    trigger: 'precio|cuanto cuesta|cuanto vale|tarifa|presupuesto|coste',
    respuesta: 'Este mes tenemos ofertas especiales 😍:\n\n• Blanqueamiento: 180€\n• Ortodoncia + blanqueamiento: desde 1.950€\n• Primera consulta: GRATIS\n\n¿Quieres que te reserve la consulta gratuita para valorar tu caso?',
    categoria: 'precios',
    prioridad: 20
  },
  {
    trigger: 'blanqueamiento|blanquear|dientes blancos|promo blanqueamiento',
    respuesta: '¡Este mes tenemos blanqueamiento por solo 180€! ✨😁\n\nEn una sola sesión. ¿Te lo reservamos? Solo necesito tu nombre y teléfono.',
    categoria: 'precios',
    prioridad: 18
  },
  {
    trigger: 'ortodoncia|brackets|invisalign|alineadores|dientes torcidos',
    respuesta: 'Tenemos ortodoncia con invisalign y brackets 😍\n\nDesde 1.950€ con financiación sin intereses. ¿Quieres que la doctora valore tu caso gratis?',
    categoria: 'precios',
    prioridad: 18
  },
  {
    trigger: 'implante|implantes|falta diente|me faltan dientes',
    respuesta: 'Los implantes son la solución más duradera 💪\n\nHacemos una valoración gratuita con radiografía. ¿Cuándo te viene bien venir?',
    categoria: 'precios',
    prioridad: 18
  },
  {
    trigger: 'empaste|caries|picadura|agujero',
    respuesta: '¡Mejor revisarlo cuanto antes para que no avance! 🦷\n\nTe buscamos un hueco esta semana. ¿A qué nombre lo pongo?',
    categoria: 'urgencias',
    prioridad: 20
  },

  // FINANCIACIÓN
  {
    trigger: 'financiacion|financiar|pago a plazos|cuotas|a plazos|sin intereses',
    respuesta: 'No te preocupes por el pago 💳\n\nFinanciamos hasta 12 meses sin intereses. ¿Quieres que calculemos las cuotas según tu tratamiento?',
    categoria: 'financiacion',
    prioridad: 15
  },

  // INFO CLÍNICA
  {
    trigger: 'doctora martinez|doctora|doctor|quien atiende',
    respuesta: 'La doctora Martínez tiene más de 15 años de experiencia 👩‍⚕️\n\nAtiende martes y jueves. ¿Te reservo un hueco con ella?',
    categoria: 'info',
    prioridad: 12
  },
  {
    trigger: 'horario|abris|cuando abren|hora de apertura|cerrado|cuando cierran',
    respuesta: 'Estamos abiertos de lunes a viernes de 9:00 a 20:00 🕘\n\nSábados de 10:00 a 14:00. ¿Quieres que te reserve cita en el horario que mejor te venga?',
    categoria: 'info',
    prioridad: 12
  },
  {
    trigger: 'donde estais|direccion|como llegar|ubicacion|donde quedais',
    respuesta: 'Estamos en el centro, fácil de llegar en metro y con parking cerca 📍\n\n¿Te mando la dirección exacta? Dime tu nombre y te envío también cómo llegar.',
    categoria: 'info',
    prioridad: 12
  },

  // SALUDOS
  {
    trigger: 'hola|buenos dias|buenas tardes|buenas noches|buenas|hey|ola',
    respuesta: '¡Hola! 😊 Soy el asistente de ReActiva Clínica Dental.\n\n¿En qué puedo ayudarte hoy? Puedo informarte sobre tratamientos, precios o reservarte cita ahora mismo.',
    categoria: 'saludo',
    prioridad: 10
  },

  // CIERRE / CONFIRMACIÓN
  {
    trigger: 'si|quiero|me interesa|adelante|reservar|confirmar|de acuerdo|ok|vale|perfecto',
    respuesta: '¡Genial! 🎉 Para confirmar la cita solo necesito:\n\n1️⃣ Tu nombre completo\n2️⃣ Tu teléfono de contacto\n\n¿Me los das?',
    categoria: 'cierre',
    prioridad: 15
  },

  // DESPEDIDAS
  {
    trigger: 'gracias|hasta luego|adios|nos vemos|bye|hasta pronto',
    respuesta: '¡Hasta pronto! 😊 Si necesitas cualquier cosa, aquí estaré.\n\nRecuerda que la primera consulta es gratuita. ¡Te esperamos!',
    categoria: 'despedida',
    prioridad: 5
  },

  // DEFAULT (siempre al final)
  {
    trigger: '__default__',
    respuesta: 'Gracias por escribirnos 😄\n\n¿En qué puedo ayudarte? Puedo informarte sobre tratamientos, precios, financiación o reservarte cita ahora mismo.',
    categoria: 'default',
    prioridad: 1
  }
];

// ─────────────────────────────────────────────
// SEED CON ANTI-DUPLICADOS (upsert por trigger)
// ─────────────────────────────────────────────
function seedRespuestas() {
  db.serialize(() => {

    // Crear tabla si no existe
    db.run(`
      CREATE TABLE IF NOT EXISTS bot_respuestas (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger   TEXT NOT NULL,
        respuesta TEXT NOT NULL,
        categoria TEXT DEFAULT 'general',
        prioridad INTEGER DEFAULT 5,
        activa    INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT (datetime('now'))
      )
    `);

    let insertados = 0;
    let actualizados = 0;
    let total = respuestas.length;

    respuestas.forEach((r, i) => {
      // Upsert: si ya existe el trigger, actualiza; si no, inserta
      db.get(
        `SELECT id FROM bot_respuestas WHERE trigger = ?`,
        [r.trigger],
        (err, row) => {
          if (err) {
            console.error(`[ERROR] Consultando trigger "${r.trigger}":`, err.message);
            return;
          }

          if (row) {
            // Actualizar existente
            db.run(
              `UPDATE bot_respuestas
               SET respuesta=?, categoria=?, prioridad=?, activa=1
               WHERE id=?`,
              [r.respuesta, r.categoria, r.prioridad, row.id],
              (err2) => {
                if (err2) console.error(`[ERROR] Actualizando id ${row.id}:`, err2.message);
                else {
                  actualizados++;
                  console.log(`[UPDATE] "${r.trigger.substring(0, 40)}..." (id: ${row.id})`);
                }
                verificarFin(insertados, actualizados, total);
              }
            );
          } else {
            // Insertar nuevo
            db.run(
              `INSERT INTO bot_respuestas (trigger, respuesta, categoria, prioridad, activa)
               VALUES (?, ?, ?, ?, 1)`,
              [r.trigger, r.respuesta, r.categoria, r.prioridad],
              function (err2) {
                if (err2) console.error(`[ERROR] Insertando "${r.trigger.substring(0, 40)}...":`, err2.message);
                else {
                  insertados++;
                  console.log(`[INSERT] "${r.trigger.substring(0, 40)}..." (id: ${this.lastID})`);
                }
                verificarFin(insertados, actualizados, total);
              }
            );
          }
        }
      );
    });

  });
}

function verificarFin(insertados, actualizados, total) {
  const procesados = insertados + actualizados;
  if (procesados === total) {
    console.log(`\n✅ Seed completado: ${insertados} nuevos, ${actualizados} actualizados (total: ${total})`);
    db.close(() => console.log('🔒 Conexión DB cerrada.'));
  }
}

// ─────────────────────────────────────────────
seedRespuestas();