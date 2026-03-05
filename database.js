//backend>database.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./reactiva.db');

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_name TEXT,
            email TEXT UNIQUE,
            password TEXT,
            plan TEXT,
            created_at TEXT
        )
    `);

    db.run(`
       CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clinic_id INTEGER,
    name TEXT,
    phone TEXT,
    message TEXT,
    timestamp TEXT,
    status TEXT,
    response_time INTEGER,
    FOREIGN KEY (clinic_id) REFERENCES users(id)
)
`);
    db.run(`
        CREATE TABLE IF NOT EXISTS pagos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_id INTEGER,
            email TEXT,
            amount REAL,
            created_at TEXT,
            FOREIGN KEY (clinic_id) REFERENCES users(id)
        )
    `);

});

module.exports = db;