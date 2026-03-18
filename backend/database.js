// backend/database.js
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "reactiva.db");

const db = new sqlite3.Database(dbPath, err => {
    if(err){
        console.error("❌ Error DB:", err.message);
    } else {
        console.log("✅ SQLite conectado en", dbPath);
    }
});

db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");
    db.run("PRAGMA journal_mode = WAL");

    // ─────────── USERS
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinic_name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        plan TEXT DEFAULT 'basic',
        paypal_order_id TEXT,
        created_at TEXT,
        tipo_clinica TEXT,
        page_id TEXT
    )`);

    // ─────────── CONFIGURACIÓN CLÍNICA
    db.run(`
    CREATE TABLE IF NOT EXISTS config_clinica (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinic_id INTEGER,
        hora_inicio TEXT DEFAULT '09:00',
        hora_fin TEXT DEFAULT '18:00',
        duracion_cita INTEGER DEFAULT 30,
        dias_laborales TEXT DEFAULT '1,2,3,4,5',
        FOREIGN KEY(clinic_id) REFERENCES users(id)
    )`);

    // ─────────── LEADS
    db.run(`
    CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinic_id INTEGER,
        name TEXT,
        phone TEXT,
        email TEXT,
        servicio TEXT,
        message TEXT,
        timestamp TEXT,
        status TEXT DEFAULT 'new',
        response_time INTEGER,
        canal TEXT DEFAULT 'web',
        external_id TEXT,
        FOREIGN KEY(clinic_id) REFERENCES users(id)
    )`);

    // ─────────── CITAS
    db.run(`
    CREATE TABLE IF NOT EXISTS citas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinic_id INTEGER,
        lead_id INTEGER,
        canal TEXT,
        external_id TEXT,
        name TEXT,
        phone TEXT,
        servicio TEXT,
        fecha TEXT,
        hora TEXT,
        status TEXT DEFAULT 'pendiente',
        created_at TEXT,
        UNIQUE(clinic_id, fecha, hora),
        FOREIGN KEY(clinic_id) REFERENCES users(id),
        FOREIGN KEY(lead_id) REFERENCES leads(id)
    )`);

    // ─────────── HORARIOS
    db.run(`
    CREATE TABLE IF NOT EXISTS horarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinic_id INTEGER,
        fecha TEXT,
        hora TEXT,
        disponible INTEGER DEFAULT 1,
        lead_id INTEGER,
        UNIQUE(clinic_id, fecha, hora),
        FOREIGN KEY(clinic_id) REFERENCES users(id),
        FOREIGN KEY(lead_id) REFERENCES leads(id)
    )`);

    // ─────────── BLOQUEOS (festivos)
    db.run(`
    CREATE TABLE IF NOT EXISTS bloqueos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinic_id INTEGER,
        fecha TEXT,
        motivo TEXT,
        FOREIGN KEY(clinic_id) REFERENCES users(id)
    )`);

    // ─────────── MENSAJES CHAT
    db.run(`
    CREATE TABLE IF NOT EXISTS mensajes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinic_id INTEGER,
        sender TEXT,
        message TEXT,
        timestamp TEXT
    )`);

    // ─────────── PAGOS
    db.run(`
    CREATE TABLE IF NOT EXISTS pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinic_id INTEGER,
        email TEXT,
        amount REAL,
        plan TEXT,
        paypal_order_id TEXT,
        created_at TEXT,
        FOREIGN KEY(clinic_id) REFERENCES users(id)
    )`);

    // ─────────── COLUMNA recordatorio_enviado en CITAS
    // ALTER TABLE ignora el error si la columna ya existe (comportamiento normal en SQLite)
    db.run(`ALTER TABLE citas ADD COLUMN recordatorio_enviado INTEGER NOT NULL DEFAULT 0`, () => {});
});

module.exports = db;