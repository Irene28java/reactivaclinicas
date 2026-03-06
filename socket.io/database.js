const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./reactiva.db');

db.serialize(() => {

    // ── USERS ──
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_name     TEXT,
            email           TEXT UNIQUE,
            password        TEXT,
            plan            TEXT DEFAULT 'basic',
            paypal_order_id TEXT,
            created_at      TEXT
        )
    `);

    // ── LEADS ──
    db.run(`
        CREATE TABLE IF NOT EXISTS leads (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_id     INTEGER,
            name          TEXT,
            phone         TEXT,
            email         TEXT,
            servicio      TEXT,
            message       TEXT,
            timestamp     TEXT,
            status        TEXT DEFAULT 'new',
            response_time INTEGER,
            FOREIGN KEY (clinic_id) REFERENCES users(id)
        )
    `);

    // ── PAGOS ──
    db.run(`
        CREATE TABLE IF NOT EXISTS pagos (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_id       INTEGER,
            email           TEXT,
            amount          REAL,
            plan            TEXT,
            paypal_order_id TEXT,
            created_at      TEXT,
            FOREIGN KEY (clinic_id) REFERENCES users(id)
        )
    `);

    // ── MIGRACIONES SEGURAS (columnas añadidas después del CREATE inicial) ──
    const migrations = [
        `ALTER TABLE leads ADD COLUMN email TEXT`,
        `ALTER TABLE leads ADD COLUMN servicio TEXT`,
        `ALTER TABLE pagos ADD COLUMN plan TEXT`,
        `ALTER TABLE pagos ADD COLUMN paypal_order_id TEXT`,
        `ALTER TABLE users ADD COLUMN paypal_order_id TEXT`,
    ];

    migrations.forEach(sql => {
        db.run(sql, err => {
            // Ignorar error "duplicate column" — es normal si ya existe
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error:', err.message);
            }
        });
    });

});

module.exports = db;