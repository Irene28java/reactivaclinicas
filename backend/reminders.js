// backend/reminders.js
// ══════════════════════════════════════════════
//  Recordatorios automáticos de citas
//
//  Corre cada hora buscando citas de mañana
//  que aún no han recibido recordatorio.
//
//  Envía:
//  - Email al paciente (si tiene email)
//  - Email a la clínica con resumen del día siguiente
//  - Mensaje por FB/IG al paciente (por la misma conversación)
//
//  Uso en server.js:
//    const reminders = require("./reminders");
//    reminders.init(app);
// ══════════════════════════════════════════════

const db    = require("./database");
const fetch = require("node-fetch");


let _app = null;

// ─────────────────────────────────────────────
// INIT — llamar desde server.js después de
// configurar sendEmail e io en app
// ─────────────────────────────────────────────
function init(app) {
    _app = app;
    console.log("⏰ Reminders: iniciado");

    // Primera ejecución al arrancar (con 10s de delay para que cargue todo)
    setTimeout(correrJob, 10_000);

    // Luego cada hora
    setInterval(correrJob, 60 * 60 * 1000);
}

// ─────────────────────────────────────────────
// JOB PRINCIPAL
// ─────────────────────────────────────────────
function correrJob() {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const fechaManana = manana.toISOString().slice(0, 10);

    console.log(`⏰ Reminders: buscando citas para ${fechaManana}...`);

    // Buscar citas de mañana que no tienen recordatorio enviado
    db.all(
        `SELECT c.*, u.clinic_name, u.email AS clinic_email, u.page_id, u.tipo_clinica
         FROM citas c
         JOIN users u ON u.id = c.clinic_id
         WHERE c.fecha = ?
           AND (c.reminder_sent IS NULL OR c.reminder_sent = 0)
           AND c.status != 'cancelada'`,
        [fechaManana],
        (err, citas) => {
            if (err) return console.error("Reminders error BD:", err);
            if (!citas || citas.length === 0) {
                return console.log("⏰ Reminders: no hay citas para mañana");
            }

            console.log(`⏰ Reminders: ${citas.length} citas mañana`);

            // Agrupar por clínica para el resumen
            const porClinica = {};

            citas.forEach(cita => {
                // Recordatorio al paciente por FB/IG
                enviarRecordatorioPaciente(cita);

                // Agrupar para resumen de clínica
                const cid = cita.clinic_id;
                if (!porClinica[cid]) {
                    porClinica[cid] = {
                        clinic_name : cita.clinic_name,
                        clinic_email: cita.clinic_email,
                        citas       : []
                    };
                }
                porClinica[cid].citas.push(cita);

                // Marcar como recordatorio enviado
                db.run(
                    `UPDATE citas SET reminder_sent=1 WHERE id=?`,
                    [cita.id],
                    err2 => { if (err2) console.error("Error marcando reminder:", err2); }
                );
            });

            // Email resumen del día a cada clínica
            Object.values(porClinica).forEach(grupo => {
                enviarResumenClinica(grupo, fechaManana);
            });
        }
    );
}

// ─────────────────────────────────────────────
// RECORDATORIO AL PACIENTE — por FB/IG Messenger
// ─────────────────────────────────────────────
function enviarRecordatorioPaciente(cita) {
    const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
    if (!PAGE_TOKEN || !cita.external_id) return;

    // No enviar si fue una cita web (no tiene external_id de FB/IG)
    if (cita.canal === "web") return;

    const emoji  = obtenerEmoji(cita.tipo_clinica);
    const nombre = cita.name ? `, ${cita.name}` : "";
    const texto  =
        `📅 Recordatorio de tu cita\n\n` +
        `Hola${nombre}! Te recordamos tu cita de mañana:\n\n` +
        `${emoji} ${cita.servicio}\n` +
        `🕐 ${cita.hora}\n` +
        `📍 ${cita.clinic_name}\n\n` +
        `Si necesitas cancelar o cambiar la cita, escríbenos aquí mismo 😊`;

    fetch(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_TOKEN}`,
        {
            method : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify({
                recipient     : { id: cita.external_id },
                message       : { text: texto },
                messaging_type: "MESSAGE_TAG",
                tag           : "CONFIRMED_EVENT_UPDATE"   // permite mensajes fuera de 24h
            })
        }
    )
    .then(r => r.json())
    .then(d => {
        if (d.error) console.error(`❌ Reminder paciente ${cita.name}:`, d.error.message);
        else         console.log(`✅ Reminder enviado a ${cita.name} (${cita.canal})`);
    })
    .catch(e => console.error("❌ fetch reminder:", e.message));
}

// ─────────────────────────────────────────────
// RESUMEN DEL DÍA A LA CLÍNICA — por email
// ─────────────────────────────────────────────
function enviarResumenClinica(grupo, fecha) {
    if (!_app) return;
    const sendEmail = _app.get("sendEmail");
    if (!sendEmail || !grupo.clinic_email) return;

    const lineas = grupo.citas
        .sort((a,b) => a.hora.localeCompare(b.hora))
        .map(c => `  ${c.hora}  |  ${c.name || "—"}  |  ${c.servicio}  |  📱 ${c.phone || "—"}`)
        .join("\n");

    const total = grupo.citas.length;
    const cuerpo =
        `Buenos días 👋\n\n` +
        `Resumen de citas para mañana ${fecha}:\n\n` +
        `${"─".repeat(60)}\n` +
        `  HORA   |  PACIENTE        |  SERVICIO              |  TELÉFONO\n` +
        `${"─".repeat(60)}\n` +
        `${lineas}\n` +
        `${"─".repeat(60)}\n\n` +
        `Total: ${total} cita${total !== 1 ? "s" : ""}\n\n` +
        `Recuerda confirmar o cancelar desde tu panel ReActiva.\n` +
        `https://reactiva-backend.up.railway.app/dashboard`;

    sendEmail(
        grupo.clinic_email,
        cuerpo,
        `📅 ${total} cita${total !== 1 ? "s" : ""} mañana ${fecha} — ${grupo.clinic_name}`
    );

    console.log(`📧 Resumen del día enviado a ${grupo.clinic_name}`);
}

// ─────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────
function obtenerEmoji(tipo) {
    const map = { dental:"🦷", estetica:"💆", dermatologia:"🩺", capilar:"💈", fisioterapia:"🏃" };
    return map[tipo] || "🏥";
}

module.exports = { init };