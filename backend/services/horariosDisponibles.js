//backendz>services>horariosDisponible.js
const db = require("../database")

function generarHorarios(clinicId, callback) {

    const hoy = new Date()
    const hoyStr = hoy.toISOString().split("T")[0]

    db.all(
        `SELECT h.id, h.fecha, h.hora
         FROM horarios h
         LEFT JOIN citas c
           ON c.fecha = h.fecha
           AND c.hora = h.hora
           AND c.clinic_id = h.clinic_id
           AND c.status != 'cancelado'
         WHERE h.clinic_id = ?
           AND h.disponible = 1
           AND h.fecha >= ?
           AND c.id IS NULL
         ORDER BY h.fecha ASC, h.hora ASC
         LIMIT 5`,
        [clinicId, hoyStr],
        (err, rows) => {

            if (err) {
                console.error(err)
                return callback([])
            }

            const horarios = rows.slice(0,3).map((h, i) => ({

                num: i + 1,
                id: h.id,
                fecha: h.fecha,
                hora: h.hora,
                label: `${formatFecha(h.fecha)} a las ${h.hora}`

            }))

            callback(horarios)

        }
    )
}

function formatFecha(fecha) {

    const f = new Date(fecha)

    const dias = [
        "domingo","lunes","martes","miércoles",
        "jueves","viernes","sábado"
    ]

    const meses = [
        "enero","febrero","marzo","abril",
        "mayo","junio","julio","agosto",
        "septiembre","octubre","noviembre","diciembre"
    ]

    return `${dias[f.getDay()]} ${f.getDate()} de ${meses[f.getMonth()]}`
}

module.exports = { generarHorarios }