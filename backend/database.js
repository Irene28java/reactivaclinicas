// backend/database.js — ÚNICA instancia de DB para todo el backend
const path   = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "reactiva.db");

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("❌ Error abriendo DB:", err.message);
    else     console.log("✅ Base de datos lista:", dbPath);
});

// WAL mode: permite lecturas concurrentes sin bloquear escrituras
db.run("PRAGMA journal_mode=WAL");
db.run("PRAGMA foreign_keys=ON");

db.serialize(() => {

    // ── USUARIOS / CLÍNICAS ──────────────────────────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_name      TEXT,
            email            TEXT UNIQUE,
            password         TEXT,
            plan             TEXT    DEFAULT 'BASIC',
            plan_status      TEXT    DEFAULT 'inactive',
            plan_started_at  TEXT,
            paypal_order_id  TEXT,
            created_at       TEXT    DEFAULT (datetime('now')),
            tipo_clinica     TEXT    DEFAULT 'dental',
            page_id          TEXT
        )
    `);

    // ── LEADS ────────────────────────────────────────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS leads (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_id     INTEGER,
            name          TEXT,
            phone         TEXT,
            email         TEXT,
            servicio      TEXT,
            message       TEXT,
            timestamp     TEXT    DEFAULT (datetime('now')),
            status        TEXT    DEFAULT 'new',
            response_time INTEGER,
            canal         TEXT    DEFAULT 'web',
            external_id   TEXT,
            updated_at    TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (clinic_id) REFERENCES users(id)
        )
    `);

    // ── CITAS ────────────────────────────────────────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS citas (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_id   INTEGER,
            lead_id     INTEGER,
            canal       TEXT    DEFAULT 'web',
            external_id TEXT,
            name        TEXT,
            phone       TEXT,
            email_paciente TEXT,
            servicio    TEXT,
            fecha       TEXT,
            hora        TEXT,
            status      TEXT    DEFAULT 'pendiente',
            notas       TEXT,
            created_at  TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (clinic_id) REFERENCES users(id),
            FOREIGN KEY (lead_id)   REFERENCES leads(id)
        )
    `);

    // ── HORARIOS ─────────────────────────────────────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS horarios (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_id   INTEGER,
            fecha       TEXT,
            hora        TEXT,
            disponible  INTEGER DEFAULT 1,
            lead_id     INTEGER,
            UNIQUE (clinic_id, fecha, hora),
            FOREIGN KEY (clinic_id) REFERENCES users(id),
            FOREIGN KEY (lead_id)   REFERENCES leads(id)
        )
    `);

    // ── RESPUESTAS DEL BOT ───────────────────────────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS bot_respuestas (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            trigger    TEXT    NOT NULL,
            respuesta  TEXT    NOT NULL,
            categoria  TEXT    DEFAULT 'general',
            prioridad  INTEGER DEFAULT 5,
            activa     INTEGER DEFAULT 1,
            created_at TEXT    DEFAULT (datetime('now'))
        )
    `);

    // ── CONFIGURACIÓN DEL BOT ────────────────────────────────────────────────
    // clave/valor: personalidad, verify_token, fb_page_token, ig_token, etc.
    db.run(`
        CREATE TABLE IF NOT EXISTS bot_config (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            clave      TEXT UNIQUE NOT NULL,
            valor      TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // ── MENSAJES DE CHAT ─────────────────────────────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS chat_mensajes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            canal       TEXT,
            lead_id     INTEGER,
            rol         TEXT    CHECK(rol IN ('user','bot')),
            contenido   TEXT,
            external_id TEXT,
            created_at  TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (lead_id) REFERENCES leads(id)
        )
    `);

    // ── PAGOS ────────────────────────────────────────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS payments (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_id  INTEGER,
            plan       TEXT,
            amount     REAL,
            order_id   TEXT UNIQUE,
            ip         TEXT,
            user_agent TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (clinic_id) REFERENCES users(id)
        )
    `);

    // ── PAGOS (tabla legacy 'pagos' — por si algún route la usa) ────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS pagos (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_id       INTEGER,
            email           TEXT,
            amount          REAL,
            plan            TEXT,
            paypal_order_id TEXT,
            created_at      TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (clinic_id) REFERENCES users(id)
        )
    `);

    // ── EVENTOS RAW DE WEBHOOK (para debugging) ──────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS webhook_events (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            canal      TEXT,
            payload    TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // ── SEED: configuración por defecto del bot ──────────────────────────────
    // INSERT OR IGNORE para no duplicar si ya existe
    const configDefaults = [
        ["personalidad",    "cercano"],
        ["verify_token",    "reactiva_verify_2024"],
        ["fb_page_token",   ""],
        ["ig_token",        ""],
        ["bot_nombre",      "Aria"],
        ["clinica_nombre",  "ReActiva Clínica"],
        ["horario",         "Lun-Vie 9:00-20:00, Sáb 9:00-14:00"],
    ];

    const stmtConfig = `INSERT OR IGNORE INTO bot_config (clave, valor) VALUES (?, ?)`;
    configDefaults.forEach(([clave, valor]) => db.run(stmtConfig, [clave, valor]));

    // ── SEED: respuestas por defecto del bot ─────────────────────────────────
    const respuestasDefault = [
        { trigger: "hola|buenos dias|buenas tardes|buenas noches|hey|saludos",
          respuesta: "¡Hola! 😊 Soy el asistente de {CLINICA}. ¿En qué puedo ayudarte hoy?",
          categoria: "saludo", prioridad: 10 },
        { trigger: "cita|reservar|turno|hora|disponible|cuando puedo venir|agendar",
          respuesta: "¡Claro! 😁 Podemos buscar el hueco perfecto. ¿Qué día te viene mejor?",
          categoria: "citas", prioridad: 20 },
        { trigger: "dolor|urgente|muela|inflamado|sangra|emergencia|urgencia",
          respuesta: "Vaya 😟 eso suena urgente. Vamos a intentar verte lo antes posible. Déjame mirar disponibilidad ahora mismo…",
          categoria: "urgencias", prioridad: 25 },
        { trigger: "precio|cuanto cuesta|cuanto vale|presupuesto|tarifa",
          respuesta: "Con mucho gusto te informo. ¿Qué tratamiento te interesa? Tenemos desde revisión gratuita hasta tratamientos especializados.",
          categoria: "precios", prioridad: 15 },
        { trigger: "blanqueamiento|promo blanqueamiento|oferta blanqueamiento",
          respuesta: "¡Este mes tenemos una oferta de blanqueamiento por solo 180€! 😁✨ ¿Quieres reservar tu cita?",
          categoria: "precios", prioridad: 16 },
        { trigger: "ortodoncia|brackets|invisalign",
          respuesta: "Ortodoncia + blanqueamiento desde 1.950€ 😍 También ofrecemos financiación hasta 12 meses sin intereses. ¿Te reservo una cita?",
          categoria: "precios", prioridad: 16 },
        { trigger: "financiacion|pago a plazos|cuotas|aplazado",
          respuesta: "No te preocupes por el pago 💳. Ofrecemos financiación hasta 12 meses sin intereses. ¿Quieres que te explique cómo funciona?",
          categoria: "financiacion", prioridad: 10 },
        { trigger: "donde|direccion|ubicacion|como llegar|calle",
          respuesta: "Estamos muy bien ubicados 📍. Escríbenos y te mandamos la dirección exacta y cómo llegar.",
          categoria: "info", prioridad: 8 },
        { trigger: "horario|hora|abrir|cerrar|cuando abren",
          respuesta: "Nuestro horario es de lunes a viernes de 9:00 a 20:00, y sábados de 9:00 a 14:00. ¿Necesitas cita en algún horario concreto?",
          categoria: "info", prioridad: 8 },
        { trigger: "gracias|perfecto|genial|vale|ok|hasta luego|adios",
          respuesta: "¡Un placer ayudarte! 😊 Recuerda que estamos aquí siempre que nos necesites. ¡Hasta pronto!",
          categoria: "despedida", prioridad: 5 },
        { trigger: "__default__",
          respuesta: "Gracias por escribirnos 😄 ¿En qué puedo ayudarte? Puedo informarte sobre tratamientos, precios, financiación o ayudarte a reservar una cita.",
          categoria: "default", prioridad: 1 },
    ];

    const stmtResp = `
        INSERT OR IGNORE INTO bot_respuestas (trigger, respuesta, categoria, prioridad)
        SELECT ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM bot_respuestas WHERE trigger=? AND categoria=?)
    `;
    respuestasDefault.forEach(r => {
        db.run(stmtResp, [r.trigger, r.respuesta, r.categoria, r.prioridad, r.trigger, r.categoria]);
    });

});

module.exports = db;