// backend/database.js
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "reactiva.db");

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("❌ DB error:", err.message);
    else console.log("✅ DB ready:", dbPath);
});

db.run("PRAGMA journal_mode=WAL");
db.run("PRAGMA foreign_keys=ON");

db.serialize(() => {

    // ─────────────────────────────
    // 🏢 TENANTS (CORE SAAS)
    // ─────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS tenants (
            id TEXT PRIMARY KEY,
            name TEXT,
            plan TEXT DEFAULT 'BASIC',
            status TEXT DEFAULT 'inactive',
            billing_provider TEXT,
            subscription_id TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // ─────────────────────────────
    // 👤 USERS
    // ─────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id TEXT,
            email TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'owner',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        )
    `);

    // ─────────────────────────────
    // 💳 PAYMENTS (PRO)
    // ─────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id TEXT,
            provider TEXT,
            plan TEXT,
            amount REAL,
            currency TEXT DEFAULT 'EUR',
            order_id TEXT UNIQUE,
            status TEXT DEFAULT 'pending',
            ip TEXT,
            user_agent TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        )
    `);

    // ─────────────────────────────
    // 🧾 LEGACY PAYMENTS (NO TOCAR)
    // ─────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS pagos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_id INTEGER,
            email TEXT,
            amount REAL,
            plan TEXT,
            paypal_order_id TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // ─────────────────────────────
    // 🧠 LEADS
    // ─────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id TEXT,
            name TEXT,
            phone TEXT,
            email TEXT,
            service TEXT,
            message TEXT,
            status TEXT DEFAULT 'new',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        )
    `);

    // ─────────────────────────────
    // 📅 CITAS
    // ─────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS citas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id TEXT,
            lead_id INTEGER,
            name TEXT,
            phone TEXT,
            service TEXT,
            date TEXT,
            time TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (lead_id) REFERENCES leads(id)
        )
    `);

    // ─────────────────────────────
    // 🕒 HORARIOS
    // ─────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS horarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id TEXT,
            date TEXT,
            time TEXT,
            available INTEGER DEFAULT 1,
            UNIQUE(tenant_id, date, time)
        )
    `);

    // ─────────────────────────────
    // 💬 CHAT BOT
    // ─────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS chat_mensajes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id TEXT,
            role TEXT,
            content TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // ─────────────────────────────
    // 🤖 BOT RESPUESTAS
    // ─────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS bot_respuestas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trigger TEXT,
            response TEXT,
            category TEXT,
            priority INTEGER DEFAULT 1,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // ─────────────────────────────
    // ⚙️ CONFIG BOT
    // ─────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS bot_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            value TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

db.run(`
CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    code_hash TEXT,
    expires_at TEXT,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
)
`);

    // ─────────────────────────────
    // 🔥 WEBHOOK EVENTS (ANTI DEBUG)
    // ─────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS webhook_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT,
            payload TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // ─────────────────────────────
    // SEEDS BOT CONFIG
    // ─────────────────────────────
    const seedConfig = [
        ["bot_name", "Aria"],
        ["clinic_name", "ReActiva"],
        ["style", "friendly"]
    ];

    seedConfig.forEach(([k, v]) => {
        db.run(
            `INSERT OR IGNORE INTO bot_config (key, value) VALUES (?, ?)`,
            [k, v]
        );
    });

});

module.exports = db;