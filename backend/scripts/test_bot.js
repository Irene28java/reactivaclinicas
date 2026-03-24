// Escapar regex especial
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Buscar respuesta según trigger
function getRespuesta(triggerText, callback) {
    const query = `
        SELECT * FROM bot_respuestas 
        WHERE activa = 1
        ORDER BY prioridad DESC
    `;

    db.all(query, [], (err, rows) => {
        if (err) return callback(err);

        const lowerText = triggerText.toLowerCase();

        for (let row of rows) {
            // Separar triggers por | y probar cada uno
            const triggers = row.trigger.split('|').map(t => t.trim());
            for (let t of triggers) {
                const regex = new RegExp(escapeRegex(t), 'i');
                if (regex.test(lowerText)) {
                    return callback(null, row.respuesta);
                }
            }
        }

        // Si no coincide nada, usar __default__
        const defaultRow = rows.find(r => r.trigger === '__default__');
        callback(null, defaultRow ? defaultRow.respuesta : 'Lo siento, no entiendo.');
    });
}