// backend/routes/webhook.js
// ══════════════════════════════════════════════
//  Bot multi-clínica / multi-especialidad
//  Sin LLM — respuestas naturales por especialidad
//
//  FLUJO:
//  inicio → servicio → nombre → telefono → horario → confirmacion → confirmado
// ══════════════════════════════════════════════

const express = require("express");
const router  = express.Router();
const fetch   = require("node-fetch");
const db      = require("../database");

const VERIFY_TOKEN   = process.env.FB_VERIFY_TOKEN || "reactiva_verify_2025";
const PAGE_TOKEN     = process.env.PAGE_ACCESS_TOKEN;
const DEFAULT_CLINIC = parseInt(process.env.DEFAULT_CLINIC_ID || "1");

// ═════════════════════════════════════════════
// CATÁLOGO DE ESPECIALIDADES
// ═════════════════════════════════════════════
const ESPECIALIDADES = {

    dental: {
        nombre    : "clínica dental",
        emoji     : "🦷",
        bienvenida: [
            "¡Hola! 👋 Bienvenido a nuestra clínica dental. Estoy aquí para ayudarte a gestionar tu cita.\n\n¿Qué tratamiento te interesa?",
            "¡Buenas! 😊 Soy el asistente de la clínica. Cuéntame, ¿en qué podemos ayudarte?",
            "¡Hola! 👋 Encantados de atenderte. ¿Qué servicio estás buscando?"
        ],
        servicios: [
            { emoji:"✨", label:"Blanqueamiento dental",   keys:["blanqueamiento","blanquear","whiten","blanco","dientes blancos"] },
            { emoji:"😁", label:"Ortodoncia / Invisalign", keys:["ortodoncia","invisalign","brackets","aparato","alineadores","dientes torcidos"] },
            { emoji:"💪", label:"Implantes dentales",      keys:["implante","implantes","corona","prótesis","diente perdido","hueso"] },
            { emoji:"🧹", label:"Limpieza dental",         keys:["limpieza","limpiar","sarro","higiene","tartar"] },
            { emoji:"🔍", label:"Revisión / diagnóstico",  keys:["revisión","revision","revisar","diagnóstico","chequeo","primera vez","primera visita"] },
            { emoji:"🔧", label:"Empaste / endodoncia",    keys:["empaste","caries","endodoncia","muela","nervio","conducto","rotura"] },
            { emoji:"🎨", label:"Carillas dentales",       keys:["carilla","carillas","veneer","sonrisa","estética dental"] },
            { emoji:"🚨", label:"Urgencia dental",         keys:["urgencia","dolor","duele","roto","fractura","hinchazón","infección","sangrado","accidente"] },
        ],
        respPrecio : "Los precios varían según el tratamiento y el diagnóstico de cada paciente. Lo mejor es que pases por una primera revisión gratuita y te damos un presupuesto sin compromiso 😊\n\n¿Te gestiono la cita?",
        respUrgencia: "Entendemos que es urgente 🚨 Danos tu número de teléfono y te llamamos en los próximos minutos.",
        respServicio: {
            "Blanqueamiento dental"  : "El blanqueamiento es uno de nuestros tratamientos más solicitados ✨ Obtendrás varios tonos más de blancura en una sola sesión.",
            "Ortodoncia / Invisalign": "Tenemos ortodoncia invisible con Invisalign y también brackets metálicos o de zafiro 😁 Hacemos un estudio personalizado sin compromiso.",
            "Implantes dentales"     : "Nuestros implantes tienen garantía de por vida y se integran de forma natural 💪 Te hacemos un diagnóstico gratuito con escáner 3D.",
            "Limpieza dental"        : "Una limpieza profesional elimina el sarro y deja tus dientes como nuevos 🧹 La recomendamos cada 6-12 meses.",
            "Revisión / diagnóstico" : "La primera revisión es completamente gratuita 🎁 En 30 minutos te hacemos un diagnóstico completo.",
            "Empaste / endodoncia"   : "Tratamos caries y endodoncias con la última tecnología, sin dolor y en una sola visita en la mayoría de casos 🔧",
            "Carillas dentales"      : "Las carillas de porcelana transforman la sonrisa completamente 🎨 Son finas como una lentilla y duran más de 15 años.",
            "Urgencia dental"        : "Atendemos urgencias el mismo día 🚨 Cuéntanos qué te pasa.",
        }
    },

    estetica: {
        nombre    : "centro de estética",
        emoji     : "💆",
        bienvenida: [
            "¡Hola! 👋 Bienvenida a nuestro centro de estética. Estoy aquí para ayudarte con tu cita.\n\n¿Qué tratamiento te interesa?",
            "¡Buenas! 💆 Cuéntame, ¿qué tratamiento estás buscando? Estaré encantada de ayudarte.",
            "¡Hola! ✨ Soy la asistente del centro. ¿En qué puedo ayudarte hoy?"
        ],
        servicios: [
            { emoji:"💉", label:"Bótox / Rellenos",           keys:["botox","bótox","relleno","hialuronico","ácido","labios","arrugas","expresión"] },
            { emoji:"✨", label:"Tratamiento facial",          keys:["facial","hidratación","peeling","microneedling","prp","dermapen","luminosidad","manchas cara"] },
            { emoji:"🌊", label:"Mesoterapia",                 keys:["mesoterapia","vitaminas piel","revitalización","cóctel"] },
            { emoji:"🔥", label:"Reducción corporal",         keys:["cavitación","cavitacion","radiofrecuencia","lpg","celulitis","grasa","reductora","moldeadora","barriga","michelines"] },
            { emoji:"🌟", label:"Depilación láser",            keys:["depilación","depilacion","láser","laser","vello","piernas","axilas","bikini","depilo"] },
            { emoji:"💅", label:"Uñas / Manicura / Pedicura", keys:["uñas","manicura","pedicura","semipermanente","gel","nail","esmalte"] },
            { emoji:"👁",  label:"Microblading / Pestañas",   keys:["microblading","cejas","pestañas","extensiones","laminado","lifting pestañas","tinte"] },
            { emoji:"💆", label:"Masaje / Relajación",        keys:["masaje","relax","relajación","spa","drenaje","linfático","antiestres","descontracturante"] },
        ],
        respPrecio : "Los precios dependen de la zona y el número de sesiones. Te hacemos una valoración gratuita y te preparamos un presupuesto personalizado sin compromiso 😊\n\n¿Te apunto para la valoración?",
        respUrgencia: "Cuéntame qué ocurre y te ayudo lo antes posible 😊 ¿Cuál es tu teléfono?",
        respServicio: {
            "Bótox / Rellenos"          : "El bótox y los rellenos con ácido hialurónico son rápidos, sin cirugía y con resultados naturales 💉 La sesión dura unos 30 minutos.",
            "Tratamiento facial"        : "Nuestros tratamientos faciales están personalizados según tu tipo de piel ✨ Incluyen diagnóstico previo gratuito.",
            "Mesoterapia"               : "La mesoterapia aporta vitaminas y activos directamente a la piel, con resultados visibles desde la primera sesión 🌊",
            "Reducción corporal"        : "Combinamos cavitación y radiofrecuencia para eliminar grasa localizada y reafirmar la piel 🔥 Resultados visibles desde la 3ª sesión.",
            "Depilación láser"          : "Con láser diodo eliminamos el vello de forma definitiva en todas las zonas del cuerpo 🌟 La sesión es prácticamente indolora.",
            "Uñas / Manicura / Pedicura": "Trabajamos con las mejores marcas y técnicas para que tus manos y pies luzcan perfectos 💅",
            "Microblading / Pestañas"   : "El microblading da volumen y forma natural a tus cejas durante 1-2 años 👁 Hacemos un diseño personalizado previo.",
            "Masaje / Relajación"       : "Nuestros masajes terapéuticos y relajantes son perfectos para desconectar y cuidar tu cuerpo 💆",
        }
    },

    dermatologia: {
        nombre    : "clínica dermatológica",
        emoji     : "🩺",
        bienvenida: [
            "¡Hola! 👋 Bienvenido a nuestra clínica dermatológica. ¿Cuál es el motivo de tu consulta?",
            "¡Buenas! 🩺 Soy el asistente de la clínica. Cuéntame qué te preocupa y te gestiono la cita.",
            "¡Hola! 😊 Estoy aquí para ayudarte. ¿Qué problema de piel quieres tratar?"
        ],
        servicios: [
            { emoji:"🔬", label:"Revisión de lunares",      keys:["lunar","mancha","mole","melanoma","nevus","dermatoscopia","peca","revisión piel"] },
            { emoji:"🌡",  label:"Acné / Rosácea",          keys:["acné","acne","grano","espinilla","rosácea","rosacea","poros","puntos negros"] },
            { emoji:"💊", label:"Psoriasis / Dermatitis",   keys:["psoriasis","dermatitis","eccema","urticaria","alergia","picor","sarpullido","erupción"] },
            { emoji:"✨", label:"Rejuvenecimiento cutáneo", keys:["rejuvenecimiento","arrugas","manchas","piel apagada","luminosidad","envejecimiento","flacidez"] },
            { emoji:"🔥", label:"Eliminación de lesiones",  keys:["verruga","fibroma","quiste","lesión","papiloma","lipoma","lunar eliminar"] },
            { emoji:"💉", label:"Medicina estética",        keys:["botox","relleno","hialuronico","prp","dermapen","estética","rejuvenecer"] },
            { emoji:"🌊", label:"Peeling médico",           keys:["peeling","exfoliación","renovación","tca","manchas peeling","acné peeling"] },
            { emoji:"🩺", label:"Consulta dermatológica",   keys:["consulta","revisión general","picor","sequedad","erupción","primera vez","segunda opinión"] },
        ],
        respPrecio : "El precio depende del diagnóstico y del tratamiento indicado. La consulta inicial incluye una exploración completa 🩺\n\n¿Te gestiono la cita?",
        respUrgencia: "Si tienes una lesión que ha cambiado de aspecto o cualquier urgencia dermatológica, es importante que la veamos cuanto antes 🚨 ¿Cuál es tu teléfono?",
        respServicio: {
            "Revisión de lunares"     : "La dermatoscopia digital permite detectar cualquier irregularidad en lunares y manchas de forma precisa y sin dolor 🔬",
            "Acné / Rosácea"          : "Tratamos el acné y la rosácea con protocolos médicos avanzados adaptados a cada tipo de piel 🌡",
            "Psoriasis / Dermatitis"  : "Contamos con los tratamientos más actuales para controlar la psoriasis y dermatitis, mejorando mucho la calidad de vida 💊",
            "Rejuvenecimiento cutáneo": "Combinamos tratamientos médicos y estéticos para conseguir una piel más joven, luminosa y firme ✨",
            "Eliminación de lesiones" : "Eliminamos verrugas, fibromas, quistes y otras lesiones benignas de forma rápida y sin cicatriz 🔥",
            "Medicina estética"       : "Realizamos procedimientos estéticos médicos con los más altos estándares de seguridad y naturalidad 💉",
            "Peeling médico"          : "El peeling médico renueva la piel, borra manchas y mejora la textura en pocas sesiones 🌊",
            "Consulta dermatológica"  : "En la primera consulta hacemos una exploración completa de tu piel y te explicamos exactamente qué tienes y cómo tratarlo 🩺",
        }
    },

    capilar: {
        nombre    : "clínica capilar",
        emoji     : "💈",
        bienvenida: [
            "¡Hola! 👋 Bienvenido a nuestra clínica capilar. ¿En qué podemos ayudarte?",
            "¡Buenas! 💈 Soy el asistente de la clínica. Cuéntame tu caso y te informo sin compromiso.",
            "¡Hola! 😊 Estoy aquí para ayudarte. ¿Tienes algún problema de caída de pelo o te interesa algún tratamiento?"
        ],
        servicios: [
            { emoji:"🌱", label:"Injerto capilar FUE",       keys:["injerto","fue","micro","trasplante","implante pelo","injerto capilar","pelo nuevo"] },
            { emoji:"💊", label:"Tratamiento caída de pelo", keys:["caída","caida","alopecia","calvicie","minoxidil","finasterida","pelo cae","pérdida"] },
            { emoji:"🔬", label:"Diagnóstico capilar",       keys:["diagnóstico","diagnostico","tricoscopia","análisis capilar","revisión pelo","cuero cabelludo"] },
            { emoji:"💉", label:"Mesoterapia capilar",       keys:["mesoterapia","vitaminas pelo","plasma capilar","prp pelo","revitalización capilar"] },
            { emoji:"⚡", label:"Láser capilar",             keys:["láser capilar","laser pelo","fotobioestimulación","lllt","luz capilar"] },
            { emoji:"👩", label:"Alopecia femenina",         keys:["mujer","femenino","femenina","difuso","androgenética","entradas mujer","cabello mujer"] },
            { emoji:"💈", label:"Barba / zonas pequeñas",    keys:["barba","cejas pelo","bigote","cicatriz","zona pequeña","entradas"] },
            { emoji:"❓", label:"Consulta / Presupuesto",    keys:["presupuesto","precio","coste","consulta","info","información","cuánto","cuanto"] },
        ],
        respPrecio : "El presupuesto del injerto depende del número de folículos necesarios, que determinamos en una valoración gratuita 😊 Sin compromiso y completamente personalizado.\n\n¿Te gestiono la cita?",
        respUrgencia: "Cuéntame qué te preocupa y te oriento enseguida 😊 ¿Cuál es tu teléfono?",
        respServicio: {
            "Injerto capilar FUE"      : "El injerto FUE es la técnica más avanzada y natural. Extraemos folículo a folículo sin cicatriz y los resultados son permanentes 🌱",
            "Tratamiento caída de pelo": "Combinamos tratamientos médicos y tecnológicos para frenar la caída y estimular el crecimiento del cabello 💊 Empezamos con un diagnóstico.",
            "Diagnóstico capilar"      : "Con tricoscopia digital analizamos el cuero cabelludo y el estado del cabello para diseñar el tratamiento más adecuado 🔬",
            "Mesoterapia capilar"      : "Inyectamos un cóctel de vitaminas y factores de crecimiento directamente en el cuero cabelludo para nutrir y fortalecer el pelo 💉",
            "Láser capilar"            : "El láser de baja potencia estimula los folículos y mejora la densidad capilar de forma progresiva y sin efectos secundarios ⚡",
            "Alopecia femenina"        : "La alopecia femenina tiene características propias y requiere un tratamiento específico. Somos especialistas en este tipo de casos 👩",
            "Barba / zonas pequeñas"   : "Realizamos injertos en barba, cejas y zonas pequeñas con resultados muy naturales 💈",
            "Consulta / Presupuesto"   : "Te hacemos una valoración gratuita y personalizada sin ningún compromiso ❓ Es el mejor punto de partida.",
        }
    },

    fisioterapia: {
        nombre    : "centro de fisioterapia",
        emoji     : "🏃",
        bienvenida: [
            "¡Hola! 👋 Bienvenido a nuestro centro de fisioterapia. ¿Qué dolencia o tratamiento buscas?",
            "¡Buenas! 🏃 Soy el asistente del centro. Cuéntame qué te molesta y te gestiono la cita.",
            "¡Hola! 😊 Estoy aquí para ayudarte. ¿Qué problema quieres tratar con fisioterapia?"
        ],
        servicios: [
            { emoji:"🦴", label:"Dolor de espalda / columna",    keys:["espalda","lumbar","cervical","columna","hernia","ciática","lumbago","dolor espalda","contractura espalda"] },
            { emoji:"🦵", label:"Rodilla / cadera / pierna",     keys:["rodilla","cadera","pierna","menisco","ligamento","femur","tibia","tobillo","pie"] },
            { emoji:"💪", label:"Hombro / cuello / brazo",       keys:["hombro","cuello","brazo","manguito","tendinitis","codo","muñeca","túnel carpiano"] },
            { emoji:"⚡", label:"Lesión deportiva",              keys:["deportiva","esguince","rotura","fibra","contractura","distensión","desgarro","corredor","atleta"] },
            { emoji:"🤰", label:"Suelo pélvico",                 keys:["pélvico","pelvico","suelo pélvico","postparto","incontinencia","embarazo","diastasis","vulvodinia"] },
            { emoji:"🧘", label:"Osteopatía",                    keys:["osteopatía","osteopatia","osteopata","visceral","craneal","sacro","fascia"] },
            { emoji:"💆", label:"Masaje terapéutico",            keys:["masaje terapéutico","miofascial","trigger","puntos gatillo","tejido blando","myofascial"] },
            { emoji:"🏃", label:"Rehabilitación postoperatoria", keys:["rehabilitación","rehabilitacion","postoperatorio","operación","cirugía","prótesis","recuperación"] },
        ],
        respPrecio : "El precio por sesión depende del tratamiento. Te lo confirmo cuando me cuentes qué dolencia tienes 😊\n\n¿Te gestiono la primera cita?",
        respUrgencia: "Entiendo que tienes dolor 😔 Danos tu teléfono y te llamamos hoy mismo para darte cita urgente.",
        respServicio: {
            "Dolor de espalda / columna"   : "El dolor de espalda es una de las consultas más frecuentes. Con una valoración inicial identificamos el origen y diseñamos el tratamiento 🦴",
            "Rodilla / cadera / pierna"    : "Tratamos todo tipo de lesiones de rodilla, cadera y miembro inferior, tanto agudas como crónicas 🦵",
            "Hombro / cuello / brazo"      : "Las lesiones de hombro y cuello requieren un abordaje específico. Nuestros fisioterapeutas son especialistas en esta zona 💪",
            "Lesión deportiva"             : "Tratamos lesiones deportivas con el objetivo de que vuelvas a tu actividad lo antes posible y en las mejores condiciones ⚡",
            "Suelo pélvico"                : "El suelo pélvico es fundamental para la salud. Tratamos disfunciones en mujeres y hombres con total discreción 🤰",
            "Osteopatía"                   : "La osteopatía trata al paciente de forma global, buscando y corrigiendo las restricciones que generan los síntomas 🧘",
            "Masaje terapéutico"           : "El masaje terapéutico libera tensiones, mejora la circulación y alivia el dolor muscular de forma eficaz 💆",
            "Rehabilitación postoperatoria": "Diseñamos un programa de rehabilitación personalizado para recuperar la movilidad y la fuerza tras una cirugía 🏃",
        }
    }
};

const ESPECIALIDAD_DEFAULT = "dental";

// ═════════════════════════════════════════════
// CACHE DE CLÍNICAS POR PAGE_ID
// ═════════════════════════════════════════════
const clinicaCache = {};

function getClinicaPorPageId(pageId, callback) {
    if (clinicaCache[pageId]) return callback(null, clinicaCache[pageId]);

    db.get(
        `SELECT id, clinic_name, tipo_clinica FROM users WHERE page_id=? LIMIT 1`,
        [pageId],
        (err, row) => {
            if (err || !row) {
                const fallback = { clinicId: DEFAULT_CLINIC, tipo: ESPECIALIDAD_DEFAULT };
                clinicaCache[pageId] = fallback;
                return callback(null, fallback);
            }
            const info = {
                clinicId : row.id,
                tipo     : row.tipo_clinica || ESPECIALIDAD_DEFAULT,
                nombre   : row.clinic_name
            };
            clinicaCache[pageId] = info;
            callback(null, info);
        }
    );
}

// ═════════════════════════════════════════════
// VERIFICACIÓN META — GET /webhook
// ═════════════════════════════════════════════
router.get("/", (req, res) => {
    const mode      = req.query["hub.mode"];
    const token     = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log(`🔍 Webhook verify — mode:${mode} token:${token}`);

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("✅ Webhook verificado correctamente");
        return res.status(200).send(challenge);
    }
    console.warn(`❌ Verificación fallida — esperado:${VERIFY_TOKEN} recibido:${token}`);
    res.sendStatus(403);
});

// ═════════════════════════════════════════════
// MENSAJES ENTRANTES META — POST /webhook
// ═════════════════════════════════════════════
router.post("/", (req, res) => {
    res.sendStatus(200); // Meta requiere 200 inmediato

    const body = req.body;
    if (body.object !== "page" && body.object !== "instagram") return;

    const canal = body.object === "instagram" ? "instagram" : "facebook";

    (body.entry || []).forEach(entry => {
        const pageId = entry.id || null;

        (entry.messaging || []).forEach(evento => {
            if (evento.message && evento.message.is_echo) return;

            const senderId = evento.sender && evento.sender.id;
            const texto    = (evento.message  && evento.message.text)    ||
                             (evento.postback && evento.postback.payload) || "";

            if (!senderId || !texto.trim()) return;

            console.log(`📨 [${canal}][page:${pageId}] ${senderId}: "${texto}"`);

            getClinicaPorPageId(pageId, (err, clinica) => {
                procesarMensaje(req, senderId, texto.trim(), canal, clinica, null);
            });
        });
    });
});

// ═════════════════════════════════════════════
// SESIONES
// ═════════════════════════════════════════════
const sesiones = {};

function getSesion(id, tipo) {
    if (!sesiones[id]) {
        sesiones[id] = {
            paso        : "inicio",
            tipo        : tipo,
            nombre      : null,
            telefono    : null,
            servicio    : null,
            leadId      : null,
            citaId      : null,
            horarios    : [],
            horaElegida : null,
            fechaElegida: null,
            reintentos  : 0,
        };
    }
    return sesiones[id];
}

function resetSesion(id) { delete sesiones[id]; }

// ═════════════════════════════════════════════
// MOTOR DEL FLUJO
// callback → web chat | null → FB/IG (usa enviarMensaje)
// ═════════════════════════════════════════════
function procesarMensaje(req, senderId, texto, canal, clinica, callback) {
    const tipo   = clinica.tipo || ESPECIALIDAD_DEFAULT;
    const esp    = ESPECIALIDADES[tipo] || ESPECIALIDADES[ESPECIALIDAD_DEFAULT];
    const sesion = getSesion(senderId, tipo);
    const t      = texto.toLowerCase().trim();

    function responder(msg) {
        if (callback) return callback(msg);
        enviarMensaje(senderId, msg);
    }

    // ── Detectores globales ──

    // Despedida
    if (/^(adiós|adios|hasta luego|bye|chao|ciao|hasta pronto|nos vemos)$/.test(t)) {
        return responder(pick([
            "¡Hasta pronto! 😊 Ha sido un placer atenderte. Que tengas un buen día.",
            "¡Hasta luego! 👋 Cuando quieras puedes escribirnos. ¡Cuídate!",
            "¡Adiós! 😊 Si necesitas algo más no dudes en escribirnos."
        ]));
    }

    // Gracias
    if (/^(gracias+|muchas gracias|thank you|genial gracias|ok gracias|perfecto gracias)$/.test(t)) {
        if (sesion.paso === "confirmado") {
            return responder(`¡A ti! 😊 Te esperamos el ${sesion.fechaElegida} a las ${sesion.horaElegida}. ¡Hasta pronto! 👋`);
        }
        return responder(pick([
            "¡De nada! 😊 ¿Hay algo más en lo que pueda ayudarte?",
            "¡Con mucho gusto! 😊 ¿Necesitas algo más?",
        ]));
    }

    // Cancelar cita existente
    if ((t.includes("cancelar") || t.includes("anular") || t.includes("cancel mi cita") || t === "cancel") && sesion.paso === "confirmado") {
        return cancelarCita(req, senderId, sesion, responder);
    }

    // Precio
    if (["precio","precios","cuánto","cuanto","cuánto cuesta","coste","presupuesto","tarifas","tarifa"].some(p => t.includes(p))
        && !["horario","confirmacion","confirmado"].includes(sesion.paso)) {
        return responder(esp.respPrecio);
    }

    // Urgencia
    const srvUrgencia = esp.servicios.find(s => s.label.toLowerCase().includes("urgencia"));
    if (srvUrgencia && ["urgencia","urgente","dolor","duele","mucho dolor","dolor fuerte","ayuda"].some(p => t.includes(p))
        && !["horario","confirmacion","confirmado"].includes(sesion.paso)) {
        sesion.servicio = srvUrgencia.label;
        sesion.paso     = "telefono";
        guardarLead(req, senderId, canal, clinica, sesion, texto);
        return responder(esp.respUrgencia);
    }

    // Saludo / reinicio
    const saludos = ["hola","buenas","buenos días","buenos","hey","hi","buenas tardes","buenas noches","inicio","start","menú","menu","empezar","reiniciar"];
    if (saludos.some(p => t === p || t.startsWith(p + " ")) && !["horario","confirmacion"].includes(sesion.paso)) {
        resetSesion(senderId);
        const s = getSesion(senderId, tipo);
        s.paso  = "servicio";
        guardarLead(req, senderId, canal, clinica, s, texto);
        return responder(buildMenuServicios(esp));
    }

    // ── FLUJO por pasos ──
    switch (sesion.paso) {

        case "inicio": {
            const srv = detectarServicio(texto, esp);
            if (srv) {
                sesion.servicio = srv;
                sesion.paso     = "nombre";
                guardarLead(req, senderId, canal, clinica, sesion, texto);
                return responder(`${esp.respServicio[srv] || ""}\n\n¿Cómo te llamas para gestionar tu cita? 😊`.trim());
            }
            sesion.paso = "servicio";
            guardarLead(req, senderId, canal, clinica, sesion, texto);
            return responder(buildMenuServicios(esp));
        }

        case "servicio": {
            const srv = detectarServicio(texto, esp);
            if (!srv) {
                sesion.reintentos = (sesion.reintentos || 0) + 1;
                if (sesion.reintentos >= 2) {
                    sesion.paso     = "telefono";
                    sesion.servicio = "Consulta general";
                    return responder(`No te preocupes 😊 Es más fácil que te llame uno de nuestros especialistas y te explica todo en un momento.\n\n¿Cuál es tu número de teléfono?`);
                }
                return responder(
                    `No he entendido bien 😊 Puedes escribir el nombre del tratamiento o el número:\n\n` +
                    esp.servicios.map((s,i) => `${i+1}. ${s.emoji} ${s.label}`).join("\n")
                );
            }
            sesion.servicio   = srv;
            sesion.paso       = "nombre";
            sesion.reintentos = 0;
            guardarLead(req, senderId, canal, clinica, sesion, texto);
            return responder(`${esp.respServicio[srv] ? esp.respServicio[srv] + "\n\n" : ""}¿Cómo te llamas para gestionar tu cita? 😊`);
        }

        case "nombre": {
            const nombre = extraerNombre(texto)
                || (texto.length >= 2 && texto.length <= 40 && /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s]+$/.test(texto)
                    ? capitalizarPrimera(texto.split(" ")[0]) : null);
            if (!nombre) {
                sesion.reintentos = (sesion.reintentos || 0) + 1;
                if (sesion.reintentos >= 2) {
                    sesion.nombre     = "Paciente";
                    sesion.paso       = "telefono";
                    sesion.reintentos = 0;
                    return responder(`No hay problema 😊 ¿Cuál es tu número de teléfono para contactarte?`);
                }
                return responder(pick([
                    "¿Cómo te llamas? Solo necesito tu nombre 😊",
                    "Perdona, no te he entendido. ¿Me dices tu nombre? 😊",
                ]));
            }
            sesion.nombre     = nombre;
            sesion.paso       = "telefono";
            sesion.reintentos = 0;
            guardarLead(req, senderId, canal, clinica, sesion, texto);
            return responder(pick([
                `¡Encantados, ${nombre}! 👋 ¿Cuál es tu número de teléfono para confirmarte la cita?`,
                `¡Hola, ${nombre}! 😊 ¿Me dejas tu teléfono para gestionar la cita?`,
                `Perfecto, ${nombre} 😊 ¿Y tu teléfono de contacto?`,
            ]));
        }

        case "telefono": {
            const tel = extraerTelefono(texto);
            if (!tel) {
                sesion.reintentos = (sesion.reintentos || 0) + 1;
                if (sesion.reintentos >= 2) {
                    return responder(`Si prefieres, puedes llamarnos directamente y te atendemos al momento 📞\n\nO escribe tu número así: 612 345 678`);
                }
                return responder(pick([
                    "No he reconocido ese número 🤔 Escríbelo así:\n📱 612 345 678",
                    "Mmm, no me llega bien el número 😅 ¿Puedes escribirlo de nuevo? Por ejemplo: 612 345 678",
                ]));
            }
            sesion.telefono   = tel;
            sesion.paso       = "horario";
            sesion.reintentos = 0;
            guardarLead(req, senderId, canal, clinica, sesion, texto, true);

            // Obtener horarios reales de la BD
            generarHorarios(clinica.clinicId, (horarios) => {
                if (!horarios.length) {
                    sesion.horarios = generarHorariosDemo();
                } else {
                    sesion.horarios = horarios;
                }
                const opcs = sesion.horarios.map(h => `${h.num}️⃣  ${h.label}`).join("\n");
                responder(`Perfecto ${sesion.nombre || ""} 🙌\n\nEstos son nuestros próximos horarios disponibles:\n\n${opcs}\n\n¿Cuál te viene mejor? Responde 1, 2 o 3`.trim());
            });
            return; // Respuesta asíncrona
        }

        case "horario": {
            const opcion = parseInt(t.replace(/[^1-3]/g, "")) || 0;
            if (opcion < 1 || opcion > 3 || !sesion.horarios[opcion-1]) {
                return responder(pick([
                    "Por favor responde con 1️⃣, 2️⃣ o 3️⃣ 😊",
                    "Escribe solo el número: 1, 2 o 3 👆",
                ]));
            }
            const elegido        = sesion.horarios[opcion-1];
            sesion.horaElegida   = elegido.hora;
            sesion.fechaElegida  = elegido.fecha;
            sesion.horarioId     = elegido.id || null;
            sesion.paso          = "confirmacion";
            return responder(
                `Perfecto, has elegido:\n\n` +
                `📅 ${elegido.label}\n` +
                `👤 ${sesion.nombre || "—"}\n` +
                `${esp.emoji} ${sesion.servicio}\n\n` +
                `¿Confirmas la cita? Responde SÍ o NO`
            );
        }

        case "confirmacion": {
            const confirma = /^(sí|si|s|ok|vale|confirm|yes|claro|perfecto|adelante|de acuerdo|correcto|exacto)$/i.test(t)
                             || t.startsWith("sí") || t === "si";
            const cancela  = /^no$/i.test(t) || t.startsWith("no ")
                             || t.includes("cancel") || t.includes("otro horario") || t.includes("cambiar");

            if (cancela) {
                sesion.paso = "horario";
                const opcs  = sesion.horarios.map(h => `${h.num}️⃣  ${h.label}`).join("\n");
                return responder(`Sin problema 😊 Elige otro horario:\n\n${opcs}\n\nResponde 1, 2 o 3`);
            }
            if (!confirma) {
                return responder("Responde SÍ para confirmar la cita o NO para cambiar el horario 😊");
            }

            guardarCita(req, senderId, canal, clinica, sesion, (citaId) => {
                sesion.citaId = citaId;
                sesion.paso   = "confirmado";
                responder(
                    `✅ ¡Cita confirmada, ${sesion.nombre || ""}!\n\n` +
                    `📅 ${sesion.fechaElegida} a las ${sesion.horaElegida}\n` +
                    `${esp.emoji} ${sesion.servicio}\n` +
                    `📱 ${sesion.telefono}\n\n` +
                    `Te enviaremos un recordatorio 24h antes por email. ¡Hasta pronto! 😊\n\n` +
                    `Si necesitas cancelar escribe CANCELAR.`
                );
            });
            return; // Respuesta asíncrona
        }

        case "confirmado": {
            if (t.includes("cancelar") || t.includes("anular") || t === "cancel") {
                return cancelarCita(req, senderId, sesion, responder);
            }
            resetSesion(senderId);
            const s = getSesion(senderId, tipo);
            s.paso  = "servicio";
            return responder(buildMenuServicios(esp));
        }

        default: {
            sesion.paso = "servicio";
            return responder(buildMenuServicios(esp));
        }
    }
}

// ═════════════════════════════════════════════
// CANCELAR CITA
// ═════════════════════════════════════════════
function cancelarCita(req, senderId, sesion, responder) {
    if (!sesion.citaId) {
        return responder("Para cancelar o modificar tu cita llámanos directamente 📞 Estaremos encantados de ayudarte.");
    }
    db.run(
        `UPDATE citas SET status='cancelada' WHERE id=?`,
        [sesion.citaId],
        (err) => {
            if (err) console.error("Error cancelando cita:", err);
            // Liberar el slot si existe
            if (sesion.horarioId) {
                db.run(`UPDATE horarios SET disponible=1 WHERE id=?`, [sesion.horarioId]);
            }
            resetSesion(senderId);
            responder(
                `❌ Tu cita ha sido cancelada correctamente.\n\n` +
                `Si quieres reservar otra cita escríbenos cuando quieras 😊`
            );
        }
    );
}

// ═════════════════════════════════════════════
// BUILDER MENÚ SERVICIOS
// ═════════════════════════════════════════════
function buildMenuServicios(esp) {
    const bienvenida = pick(esp.bienvenida);
    const lista = esp.servicios.map((s, i) => `${i+1}. ${s.emoji} ${s.label}`).join("\n");
    return `${bienvenida}\n\n${lista}\n\nEscribe el nombre del servicio o su número 👆`;
}

// ═════════════════════════════════════════════
// DETECCIÓN DE SERVICIO
// ═════════════════════════════════════════════
function detectarServicio(texto, esp) {
    const t   = texto.toLowerCase().trim();
    const num = parseInt(t);
    if (!isNaN(num) && num >= 1 && num <= esp.servicios.length) {
        return esp.servicios[num-1].label;
    }
    const sorted = [...esp.servicios].sort((a,b) => b.keys.length - a.keys.length);
    for (const srv of sorted) {
        if (srv.keys.some(k => t.includes(k))) return srv.label;
    }
    return null;
}

// ═════════════════════════════════════════════
// HORARIOS — lee de la BD, fallback a demo
// ═════════════════════════════════════════════
function generarHorarios(clinicId, callback) {
    const hoy    = new Date();
    const hoyStr = hoy.toISOString().split("T")[0];

    db.all(
        `SELECT id, fecha, hora FROM horarios
         WHERE clinic_id=? AND disponible=1 AND fecha>=?
         ORDER BY fecha ASC, hora ASC
         LIMIT 3`,
        [clinicId, hoyStr],
        (err, rows) => {
            if (err || !rows || !rows.length) {
                console.warn("Sin horarios en BD, usando demo");
                return callback([]);
            }
            const horarios = rows.map((h, i) => ({
                num   : i + 1,
                id    : h.id,
                fecha : h.fecha,
                hora  : h.hora,
                label : `${formatFechaHumana(h.fecha)} a las ${h.hora}`
            }));
            callback(horarios);
        }
    );
}

// Fallback: genera 3 horarios demo si la BD está vacía
function generarHorariosDemo() {
    const dias   = ["Lunes","Martes","Miércoles","Jueves","Viernes"];
    const horas  = ["09:00","10:30","11:00","12:00","16:00","17:30","18:00"];
    const hoy    = new Date();
    const result = [];
    let offset   = 1;

    while (result.length < 3) {
        const d = new Date(hoy);
        d.setDate(hoy.getDate() + offset);
        const dow = d.getDay(); // 0=dom, 6=sab
        if (dow >= 1 && dow <= 5) {
            const fecha = d.toISOString().split("T")[0];
            const hora  = horas[result.length * 2 % horas.length];
            result.push({
                num   : result.length + 1,
                id    : null,
                fecha,
                hora,
                label : `${dias[dow-1]} ${fecha} a las ${hora}`
            });
        }
        offset++;
        if (offset > 14) break;
    }
    return result;
}

function formatFechaHumana(iso) {
    const [y, m, d] = iso.split("-");
    const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    const fecha  = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
    const dias   = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
    return `${dias[fecha.getDay()]} ${d}/${m}/${y}`;
}

// ═════════════════════════════════════════════
// GUARDAR LEAD
// ═════════════════════════════════════════════
function guardarLead(req, senderId, canal, clinica, sesion, mensaje, notificar = false) {
    const clinicId = clinica.clinicId;
    const ts       = new Date().toISOString();

    db.get(
        `SELECT id, phone FROM leads WHERE external_id=? AND canal=?`,
        [senderId, canal],
        (err, existing) => {
            if (err) return console.error("Error buscando lead:", err);

            if (existing) {
                db.run(
                    `UPDATE leads SET
                        name     = COALESCE(?,name),
                        phone    = COALESCE(?,phone),
                        servicio = COALESCE(?,servicio),
                        message  = ?
                     WHERE id=?`,
                    [sesion.nombre||null, sesion.telefono||null, sesion.servicio||null, mensaje, existing.id],
                    err2 => { if (err2) console.error("Error actualizando lead:", err2); }
                );
                sesion.leadId = existing.id;
                if (notificar && sesion.telefono && !existing.phone) {
                    notificarEmailLead(req, sesion, canal, clinica);
                }
            } else {
                db.run(
                    `INSERT INTO leads
                     (clinic_id,canal,external_id,name,phone,servicio,message,timestamp,status)
                     VALUES (?,?,?,?,?,?,?,?,'new')`,
                    [clinicId, canal, senderId,
                     sesion.nombre||null, sesion.telefono||null,
                     sesion.servicio||null, mensaje, ts],
                    function(err2) {
                        if (err2) return console.error("Error insertando lead:", err2);
                        sesion.leadId = this.lastID;

                        const io = req.app.get("io");
                        if (io) {
                            io.to(`clinic_${clinicId}`).emit("new_lead", {
                                id: this.lastID, clinic_id: clinicId, canal,
                                name: sesion.nombre, phone: sesion.telefono,
                                servicio: sesion.servicio, message: mensaje,
                                timestamp: ts, status: "new"
                            });
                        }
                        if (notificar && sesion.telefono) {
                            notificarEmailLead(req, sesion, canal, clinica);
                        }
                    }
                );
            }
        }
    );
}

// ═════════════════════════════════════════════
// GUARDAR CITA
// ═════════════════════════════════════════════
function guardarCita(req, senderId, canal, clinica, sesion, callback) {
    const clinicId = clinica.clinicId;
    const ts       = new Date().toISOString();

    // Marcar el slot como no disponible si existe
    if (sesion.horarioId) {
        db.run(`UPDATE horarios SET disponible=0 WHERE id=?`, [sesion.horarioId]);
    }

    db.run(
        `INSERT INTO citas
         (clinic_id,lead_id,canal,external_id,name,phone,servicio,fecha,hora,status,recordatorio_enviado,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,'pendiente',0,?)`,
        [clinicId, sesion.leadId||null, canal, senderId,
         sesion.nombre, sesion.telefono, sesion.servicio,
         sesion.fechaElegida, sesion.horaElegida, ts],
        function(err) {
            if (err) {
                console.error("Error guardando cita:", err);
                return callback(null);
            }
            const citaId = this.lastID;
            console.log(`📅 Cita #${citaId} — ${sesion.nombre} ${sesion.fechaElegida} ${sesion.horaElegida}`);

            const io = req.app.get("io");
            if (io) {
                io.to(`clinic_${clinicId}`).emit("new_cita", {
                    id: citaId, name: sesion.nombre,
                    phone: sesion.telefono, servicio: sesion.servicio,
                    fecha: sesion.fechaElegida, hora: sesion.horaElegida,
                    canal, status: "pendiente"
                });
            }

            notificarEmailCita(req, sesion, canal, clinica);

            if (sesion.leadId) {
                db.run(`UPDATE leads SET status='pending' WHERE id=?`, [sesion.leadId]);
            }

            callback(citaId);
        }
    );
}

// ═════════════════════════════════════════════
// RECORDATORIOS 24h — llamar desde server.js con setInterval
// ═════════════════════════════════════════════
function procesarRecordatorios(app) {
    const sendEmail = app.get("sendEmail");
    if (!sendEmail) return;

    const ahora    = new Date();
    const maniana  = new Date(ahora);
    maniana.setDate(ahora.getDate() + 1);
    const fechaStr = maniana.toISOString().split("T")[0]; // YYYY-MM-DD

    db.all(
        `SELECT c.id, c.name, c.phone, c.servicio, c.fecha, c.hora, c.canal,
                c.external_id, c.clinic_id,
                u.clinic_name
         FROM citas c
         LEFT JOIN users u ON u.id = c.clinic_id
         WHERE c.fecha=? AND c.status='pendiente' AND c.recordatorio_enviado=0`,
        [fechaStr],
        (err, citas) => {
            if (err) return console.error("Error buscando citas para recordatorio:", err);
            if (!citas || !citas.length) return;

            console.log(`🔔 Enviando ${citas.length} recordatorio(s) para ${fechaStr}`);

            citas.forEach(cita => {
                const clinicaNombre = cita.clinic_name || "la clínica";
                const asunto  = `Recordatorio: tu cita mañana — ${cita.servicio}`;
                const cuerpo  =
                    `Hola ${cita.name || "paciente"} 👋\n\n` +
                    `Te recordamos que mañana tienes una cita en ${clinicaNombre}:\n\n` +
                    `📅 Fecha: ${cita.fecha}\n` +
                    `🕐 Hora:  ${cita.hora}\n` +
                    `💊 Servicio: ${cita.servicio}\n\n` +
                    `Si necesitas cancelar o cambiar la cita, contáctanos lo antes posible.\n\n` +
                    `¡Hasta mañana! 😊\n` +
                    `— El equipo de ${clinicaNombre}`;

                // Email a la clínica
                const clinicEmail = process.env.CLINIC_EMAIL || process.env.EMAIL_USER;
                sendEmail(clinicEmail, cuerpo, `📅 Recordatorio cita — ${cita.name} mañana ${cita.hora}`);

                // También enviar recordatorio por FB/IG Messenger si el canal lo permite
                if ((cita.canal === "facebook" || cita.canal === "instagram") && PAGE_TOKEN && cita.external_id) {
                    const msgRecordatorio =
                        `¡Hola ${cita.name || ""}! 👋 Te recordamos tu cita de mañana:\n\n` +
                        `📅 ${cita.fecha} a las ${cita.hora}\n` +
                        `💊 ${cita.servicio}\n\n` +
                        `Si necesitas cancelar escribe CANCELAR 😊`;
                    enviarMensaje(cita.external_id, msgRecordatorio);
                }

                // Marcar como recordatorio enviado
                db.run(`UPDATE citas SET recordatorio_enviado=1 WHERE id=?`, [cita.id],
                    err2 => { if (err2) console.error(`Error marcando recordatorio #${cita.id}:`, err2); }
                );
            });
        }
    );
}

// ═════════════════════════════════════════════
// EMAILS
// ═════════════════════════════════════════════
function notificarEmailLead(req, sesion, canal, clinica) {
    const sendEmail = app_get_sendEmail(req);
    if (!sendEmail) return;
    const c       = labelCanal(canal);
    const toEmail = process.env.CLINIC_EMAIL || process.env.EMAIL_USER;
    sendEmail(
        toEmail,
        `${c} — Nuevo lead\n\nNombre:   ${sesion.nombre||"—"}\nTeléfono: ${sesion.telefono||"—"}\nServicio: ${sesion.servicio||"—"}`,
        `🔔 Nuevo lead [${c}] — ${sesion.nombre||"Sin nombre"}`
    );
}

function notificarEmailCita(req, sesion, canal, clinica) {
    const sendEmail = app_get_sendEmail(req);
    if (!sendEmail) return;
    const c       = labelCanal(canal);
    const toEmail = process.env.CLINIC_EMAIL || process.env.EMAIL_USER;
    sendEmail(
        toEmail,
        `${c} — Cita confirmada\n\nPaciente:  ${sesion.nombre}\nTeléfono:  ${sesion.telefono}\nServicio:  ${sesion.servicio}\nFecha:     ${sesion.fechaElegida}\nHora:      ${sesion.horaElegida}`,
        `📅 Cita confirmada — ${sesion.nombre} — ${sesion.fechaElegida} ${sesion.horaElegida}`
    );
}

function app_get_sendEmail(req) {
    try { return req.app.get("sendEmail"); } catch { return null; }
}

function labelCanal(canal) {
    return canal === "instagram" ? "📸 Instagram" : canal === "web" ? "🌐 Web" : "📘 Facebook";
}

// ═════════════════════════════════════════════
// ENVIAR MENSAJE — Graph API Meta
// ═════════════════════════════════════════════
function enviarMensaje(recipientId, texto) {
    if (!PAGE_TOKEN) { console.warn("⚠️  PAGE_ACCESS_TOKEN no configurado"); return; }
    fetch(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_TOKEN}`,
        {
            method : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify({
                recipient     : { id: recipientId },
                message       : { text: texto },
                messaging_type: "RESPONSE"
            })
        }
    )
    .then(r => r.json())
    .then(d => { if (d.error) console.error("❌ Graph API:", d.error.message); })
    .catch(e => console.error("❌ fetch Meta:", e.message));
}

// ═════════════════════════════════════════════
// UTILIDADES
// ═════════════════════════════════════════════
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function extraerTelefono(t) {
    const m = t.match(/(\+?[\d\s\-\.]{9,15})/);
    return m ? m[0].replace(/[\s\-\.]/g, "") : null;
}

function extraerNombre(t) {
    const m = t.match(/(?:soy|me llamo|llamo|mi nombre es|nombre)\s+([a-záéíóúüñ]+(?:\s[a-záéíóúüñ]+)?)/i);
    return m ? capitalizarPrimera(m[1]) : null;
}

function capitalizarPrimera(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

// ═════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════
module.exports                        = router;
module.exports.procesarMensaje        = procesarMensaje;
module.exports.procesarRecordatorios  = procesarRecordatorios;