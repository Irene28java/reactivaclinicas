//backend>socket.io>database.js
//const path = require('path');
//const sqlite3 = require('sqlite3').verbose();

// ── Ruta absoluta para la base de datos ──
//const dbPath = path.join(__dirname, '..', 'reactiva.db'); // apunta a la misma base de datos que backend/database.js
//const db = new sqlite3.Database(dbPath, (err) => {
  //  if (err) console.error('Error al abrir la DB:', err.message);
   // else console.log('Base de datos lista en', dbPath);
//});

//db.serialize(() => {
    // ── CREACIÓN DE TABLAS (si no existen) ──
  //  db.run(`
   //     CREATE TABLE IF NOT EXISTS users (
     //       id INTEGER PRIMARY KEY AUTOINCREMENT,
       //     clinic_name TEXT,
         //   email TEXT UNIQUE,
           // password TEXT,
        //    plan TEXT DEFAULT 'basic',
          //  paypal_order_id TEXT,
           // created_at TEXT,
            //tipo_clinica TEXT,
           // page_id TEXT
        //)
    //`);

   // db.run(`
  //      CREATE TABLE IF NOT EXISTS leads (
  //          id INTEGER PRIMARY KEY AUTOINCREMENT,
//         clinic_id INTEGER,
  //          name TEXT,
    //        phone TEXT,
      //      email TEXT,
      //      servicio TEXT,
     //      message TEXT,
    //        timestamp TEXT,
    //        status TEXT DEFAULT 'new',
 
 //   response_time INTEGER,
   //         canal TEXT DEFAULT 'web',
  //          external_id TEXT,
  //          FOREIGN KEY (clinic_id) REFERENCES users(id)
   //     )
  //  `);

  //  db.run(`
        CREATE TABLE IF NOT EXISTS pagos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_id INTEGER,
            email TEXT,
            amount REAL,
            plan TEXT,
            paypal_order_id TEXT,
            created_at TEXT,
            FOREIGN KEY (clinic_id) REFERENCES users(id)
        )
    //`);

//    db.run(`
  //      CREATE TABLE IF NOT EXISTS citas (
    //        id INTEGER PRIMARY KEY AUTOINCREMENT,
      //      clinic_id INTEGER,
   //         lead_id INTEGER,
     //       canal TEXT,
     //       external_id TEXT,
   //         name TEXT,
         //   phone TEXT,
       ///     servicio TEXT,
          ///  fecha TEXT,
        ///    hora TEXT,
           /// status TEXT DEFAULT 'pendiente',
            ///created_at TEXT
       // )
  //  `);

//    db.run(`
     //   CREATE TABLE IF NOT EXISTS horarios (
  //   id INTEGER PRIMARY KEY AUTOINCREMENT,
    //        clinic_id INTEGER,
      //      fecha TEXT,
        //    hora TEXT,
          //  disponible INTEGER DEFAULT 1,
          //  lead_id INTEGER,
          //  FOREIGN KEY (clinic_id) REFERENCES users(id),
            //FOREIGN KEY (lead_id) REFERENCES leads(id)
       // )
   //`);
   

//});

//module.exports = db;