(function () {
  "use strict";

  const el = document.getElementById("reactiva-widget");
  if (!el) return;

  const CLINIC_ID = el.dataset.clinicId || "1";
  const COLOR = el.dataset.color || "#00e676";
  const NOMBRE = el.dataset.nombre || "Asistente";
  const API = "https://reactiva-backend.up.railway.app";

  const sesion = {
    nombre: null,
    telefono: null,
    email: null,
    servicio: null,
    sessionId: null // ← generamos un id de sesión único
  };

  // ───────────────── ESTILOS ─────────────────
  const style = document.createElement("style");
  style.textContent = `/* tu CSS de antes */`;
  document.head.appendChild(style);

  // ───────────────── HTML ─────────────────
  const bubble = document.createElement("button");
  bubble.id = "ra-bubble";
  bubble.innerHTML = "💬";

  const panel = document.createElement("div");
  panel.id = "ra-panel";

  panel.innerHTML = `
<div class="ra-header">
🦷 ${NOMBRE}
</div>

<div class="ra-messages" id="ra-msgs"></div>

<div class="ra-footer">
<input class="ra-input" id="ra-input" placeholder="Escribe tu consulta...">
<button class="ra-send" id="ra-send">➤</button>
</div>
`;

  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  // ───────────────── ABRIR / CERRAR ─────────────────
  let open = false;
  bubble.onclick = () => {
    open = !open;
    panel.classList.toggle("open", open);
    if (open && document.getElementById("ra-msgs").children.length === 0) {
      addMsg("bot", `Hola 👋 soy el asistente de ${NOMBRE}. ¿En qué puedo ayudarte?`);
    }
  };

  // ───────────────── MENSAJES ─────────────────
  function addMsg(tipo, texto) {
    const msgs = document.getElementById("ra-msgs");
    const div = document.createElement("div");
    div.className = "ra-msg " + tipo;
    div.textContent = texto;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ───────────────── ENVÍO ─────────────────
  async function enviar() {
    const input = document.getElementById("ra-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    addMsg("user", text);

    // Guardar lead en backend
    await enviarLead(text);

    // Enviar mensaje al backend real
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId: sesion.sessionId || (sesion.sessionId = Date.now()), // id único
          canal: "web",
          clinicId: CLINIC_ID
        }),
      });
      const data = await res.json();
      // Guardamos datos de sesión desde la respuesta si vienen
      if (data.sesion) Object.assign(sesion, data.sesion);

      addMsg("bot", data.reply?.texto || "Lo siento, no entendí eso 😅");
    } catch (e) {
      addMsg("bot", "Error de conexión con el servidor 😢");
    }
  }

  document.getElementById("ra-send").onclick = enviar;
  document.getElementById("ra-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") enviar();
  });

  // ───────────────── LEADS ─────────────────
  async function enviarLead(mensaje) {
    try {
      await fetch(`${API}/api/leads/public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinic_id: CLINIC_ID,
          message: mensaje,
          name: sesion.nombre,
          phone: sesion.telefono,
          email: sesion.email,
          servicio: sesion.servicio,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (e) {}
  }

})();