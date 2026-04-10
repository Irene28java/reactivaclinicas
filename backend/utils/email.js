const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOTP(email, code) {
  try {
    await resend.emails.send({
      from: 'ReActiva <onboarding@resend.dev>',
      to: email,
      subject: 'Tu código de acceso',
      html: `
        <div style="font-family:Arial">
          <h2>🔐 Código de acceso</h2>
          <h1 style="letter-spacing:4px;">${code}</h1>
          <p>Caduca en 5 minutos.</p>
        </div>
      `
    });

    console.log("✅ Email enviado a:", email);

  } catch (err) {
    console.error("❌ Error enviando email:", err);
  }
}

module.exports = { sendOTP };