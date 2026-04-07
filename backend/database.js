// backend/database.js

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "reactiva.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("❌ DB error:", err.message);
  else console.log("✅ DB ready:", dbPath);
});

// ─────────────────────────────
// CONFIG
// ─────────────────────────────
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
      plan TEXT DEFAULT 'FREE',
      status TEXT DEFAULT 'inactive',
      billing_provider TEXT,
      subscription_id TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan)`);

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

  db.run(`CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`);

  // ─────────────────────────────
  // 💳 PAYMENTS (UNIFICADO PRO)
  // ─────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT,

      provider TEXT, -- stripe | paypal | lemon
      event_type TEXT,

      plan TEXT,
      amount REAL,
      currency TEXT DEFAULT 'EUR',

      order_id TEXT UNIQUE,
      status TEXT DEFAULT 'pending',

      ip TEXT,
      user_agent TEXT,

      raw TEXT,

      created_at TEXT DEFAULT (datetime('now')),

      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id)`);

  // ─────────────────────────────
  // 🔐 WEBHOOK EVENTS (ANTI DUPLICATE)
  // ─────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT,
      event_id TEXT UNIQUE,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ─────────────────────────────
  // 🔐 OTP CODES (SEGURO)
  // ─────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      code_hash TEXT,
      attempts INTEGER DEFAULT 0,
      ip TEXT,
      used INTEGER DEFAULT 0,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email)`);

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

  db.run(`
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER,
  fecha TEXT,
  estado TEXT DEFAULT 'pendiente',
  created_at TEXT
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

  // ─────────────────────────────
  // 🌱 SEEDS
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