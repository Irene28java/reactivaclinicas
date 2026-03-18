const cron = require("node-cron")
const db = require("../database")

function iniciarRecordatorios(){

cron.schedule("0 * * * *", ()=>{

const mañana = new Date()
mañana.setDate(mañana.getDate()+1)

const fecha = mañana.toISOString().split("T")[0]

db.all(`
SELECT * FROM citas
WHERE fecha=? AND status='confirmada'
`,[fecha],(err,citas)=>{

if(!citas) return

citas.forEach(c=>{

console.log("🔔 Recordatorio cita:",c.telefono,c.fecha,c.hora)

/*
aquí puedes enviar:

WhatsApp
email
sms
*/

})

})

})

}

module.exports = { iniciarRecordatorios }