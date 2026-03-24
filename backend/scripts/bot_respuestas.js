const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./reactiva.db');

const respuestas = [
  {trigger: 'hola|buenos dias|buenas tardes', respuesta: '¡Hola! 😊 Soy el asistente de ReActiva Clínica. ¿En qué puedo ayudarte hoy? Puedo informarte sobre tratamientos o ayudarte a reservar una cita.', categoria: 'saludo', prioridad: 10},
  {trigger: 'cita|reservar|turno|hora|disponible', respuesta: '¡Genial! 😁 Podemos buscar un horario que te venga perfecto. Déjame mirar la disponibilidad…', categoria: 'citas', prioridad: 20},
  {trigger: 'dolor|urgente|muela|inflamado|sangra', respuesta: 'Vaya 😟 eso suena urgente.\n\n👉 Podemos intentar verte lo antes posible para aliviarte.\n\nDéjame mirar disponibilidad ahora mismo…', categoria: 'urgencias', prioridad: 25},
  {trigger: 'blanqueamiento|promo blanqueamiento|oferta blanqueamiento', respuesta: '¡Este mes tenemos una oferta de blanqueamiento por solo 180€! 😁✨ ¿Quieres reservar tu cita?', categoria: 'precios', prioridad: 15},
  {trigger: 'ortodoncia|brackets|invisalign', respuesta: 'Ortodoncia + blanqueamiento desde 1.950€ 😍\n\nTambién ofrecemos financiación hasta 12 meses sin intereses. ¿Quieres que te reserve una cita con la doctora?', categoria: 'precios', prioridad: 15},
  {trigger: 'financiacion|pago a plazos|cuotas', respuesta: 'No te preocupes por el pago 💳, ofrecemos financiación hasta 12 meses sin intereses. ¿Quieres que te explique cómo funciona?', categoria: 'financiacion', prioridad: 10},
  {trigger: 'doctora martinez|solo martes|solo jueves', respuesta: 'La doctora Martínez atiende solo martes y jueves. ¿Quieres que te busque un slot disponible en esos días?', categoria: 'info', prioridad: 10},
  {trigger: 'gracias|perfecto|vale|ok', respuesta: '¡Me alegra poder ayudarte! 😊 Si quieres, puedo mostrarte nuestros horarios disponibles para reservar tu cita.', categoria: 'despedida', prioridad: 5},
  {trigger: '__default__', respuesta: 'Gracias por escribirnos. ¿En qué puedo ayudarte? 😄\n\nPuedo informarte sobre tratamientos, precios, financiación o ayudarte a reservar una cita.', categoria: 'default', prioridad: 1}
];

respuestas.forEach(r => {
  db.run('INSERT INTO bot_respuestas (trigger, respuesta, categoria, prioridad) VALUES (?, ?, ?, ?)',
         [r.trigger, r.respuesta, r.categoria, r.prioridad]);
});

db.close(() => console.log('Respuestas del bot insertadas correctamente.'));