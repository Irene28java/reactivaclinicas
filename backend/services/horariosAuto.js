const cron = require("node-cron")
const { generarHorariosDia } = require("./horariosGenerator")

function iniciarAutoHorarios() {

    cron.schedule("0 3 * * *", () => {

        console.log("🕒 Generando horarios próximos 30 días")

        const clinicId = 1

        for(let i=0;i<30;i++){

            const fecha = new Date()
            fecha.setDate(fecha.getDate()+i)

            const fechaStr = fecha.toISOString().split("T")[0]

            generarHorariosDia(clinicId,fechaStr)

        }

    })

}

module.exports = { iniciarAutoHorarios }