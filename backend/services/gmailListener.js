//backend>services>gmailListener.js
const Imap = require("imap-simple");
const { simpleParser } = require("mailparser");
const webhook = require("../routes/webhook"); // asegúrate que tengas procesarMensaje allí

const config = {
  imap: { 
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASS,
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    authTimeout: 3000
  }
};

async function listenEmails(app) {
  try {
    const connection = await Imap.connect(config);
    await connection.openBox("INBOX");
    console.log("📧 Gmail listener activo");

    setInterval(async () => {
      const searchCriteria = ["UNSEEN"];
      const fetchOptions = { bodies: [""], markSeen: true };
      const messages = await connection.search(searchCriteria, fetchOptions);

      for (const item of messages) {
        const all = item.parts.find(p => p.which === "");
        const parsed = await simpleParser(all.body);

        const email = parsed.from.value[0].address;
        const texto = parsed.text || parsed.subject || "Hola, quiero información";

        console.log("📨 Gmail:", email);

        const clinica = {
          clinicId: Number(process.env.DEFAULT_CLINIC_ID || 1),
          tipo: "dental"
        };

        webhook.procesarMensaje({ app }, email, texto, "gmail", clinica, null);
      }
    }, 60000);

  } catch (err) {
    console.error("❌ Gmail listener error:", err);
  }
}

module.exports = { listenEmails };