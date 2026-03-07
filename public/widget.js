/* ══════════════════════════════════════════════
   ReActiva Clínicas — widget.js
   Widget SaaS multi-clínica
   Se instala con 1 línea en cualquier web
   ══════════════════════════════════════════════ */

(function () {
  "use strict";

  // ─────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────

  const el = document.getElementById("reactiva-widget");
  if (!el) return;

  const CLINIC_ID = el.dataset.clinicId || "1";
  const COLOR = el.dataset.color || "#00e676";
  const NOMBRE = el.dataset.nombre || "Asistente";

  const API = "https://reactiva-backend.up.railway.app";

  // ─────────────────────────────────────────────
  // SESIÓN DEL BOT
  // ─────────────────────────────────────────────

  const sesion = {
    nombre: null,
    telefono: null,
    email: null,
    servicio: null,
  };

  // ─────────────────────────────────────────────
  // ESTILOS
  // ─────────────────────────────────────────────

  const style = document.createElement("style");

  style.textContent = `
#ra-bubble{
position:fixed;
bottom:24px;
right:24px;
z-index:99999;
width:56px;
height:56px;
border-radius:50%;
background:${COLOR};
border:none;
cursor:pointer;
box-shadow:0 6px 25px rgba(0,0,0,.3);
font-size:22px;
display:flex;
align-items:center;
justify-content:center;
}

#ra-panel{
position:fixed;
bottom:96px;
right:24px;
width:340px;
max-height:520px;
background:#141920;
border-radius:16px;
overflow:hidden;
box-shadow:0 16px 60px rgba(0,0,0,.5);
display:flex;
flex-direction:column;
transform:scale(.9);
opacity:0;
pointer-events:none;
transition:.25s;
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
}

#ra-panel.open{
transform:scale(1);
opacity:1;
pointer-events:all;
}

.ra-header{
padding:14px;
background:#0f1318;
display:flex;
align-items:center;
gap:10px;
color:white;
font-size:14px;
}

.ra-messages{
flex:1;
overflow-y:auto;
padding:14px;
display:flex;
flex-direction:column;
gap:8px;
background:#07090d;
}

.ra-msg{
max-width:85%;
padding:10px 12px;
font-size:13px;
border-radius:12px;
}

.ra-msg.bot{
background:#1a2028;
color:white;
}

.ra-msg.user{
background:${COLOR};
color:#07090d;
font-weight:600;
align-self:flex-end;
}

.ra-footer{
padding:10px;
display:flex;
gap:8px;
background:#0f1318;
}

.ra-input{
flex:1;
padding:8px;
border-radius:8px;
border:none;
outline:none;
}

.ra-send{
background:${COLOR};
border:none;
padding:8px 10px;
border-radius:8px;
cursor:pointer;
font-weight:bold;
}
`;

  document.head.appendChild(style);

  // ─────────────────────────────────────────────
  // HTML
  // ─────────────────────────────────────────────

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

  // ─────────────────────────────────────────────
  // ABRIR / CERRAR
  // ─────────────────────────────────────────────

  let open = false;

  bubble.onclick = () => {
    open = !open;
    panel.classList.toggle("open", open);

    if (open && document.getElementById("ra-msgs").children.length === 0) {
      addMsg(
        "bot",
        `Hola 👋 soy el asistente de ${NOMBRE}. ¿En qué puedo ayudarte?`
      );
    }
  };

  // ─────────────────────────────────────────────
  // MENSAJES
  // ─────────────────────────────────────────────

  function addMsg(tipo, texto) {
    const msgs = document.getElementById("ra-msgs");

    const div = document.createElement("div");
    div.className = "ra-msg " + tipo;
    div.textContent = texto;

    msgs.appendChild(div);

    msgs.scrollTop = msgs.scrollHeight;
  }

  // ─────────────────────────────────────────────
  // ENVÍO
  // ─────────────────────────────────────────────

  function enviar() {
    const input = document.getElementById("ra-input");
    const text = input.value.trim();

    if (!text) return;

    input.value = "";

    addMsg("user", text);

    enviarLead(text);

    setTimeout(() => {
      addMsg("bot", generarRespuesta(text));
    }, 600);
  }

  document.getElementById("ra-send").onclick = enviar;

  document.getElementById("ra-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") enviar();
  });

  // ─────────────────────────────────────────────
  // ENVIAR LEAD AL BACKEND
  // ─────────────────────────────────────────────

  async function enviarLead(mensaje) {
    try {
      await fetch(`${API}/api/leads/public`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

  // ─────────────────────────────────────────────
  // BOT INTELIGENTE
  // ─────────────────────────────────────────────

  function generarRespuesta(text) {
    const t = text.toLowerCase();

    const tel = text.match(/(\+?[\d\s]{9,15})/);
    const mail = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    const nom = text.match(/(soy|me llamo)\s+([a-záéíóúñ]+)/i);

    if (tel) sesion.telefono = tel[0].replace(/\s/g, "");
    if (mail) sesion.email = mail[0];
    if (nom) sesion.nombre = nom[2];

    if (sesion.telefono && sesion.nombre) {
      return `Perfecto ${sesion.nombre} 🙌 Te llamaremos hoy mismo.`;
    }

    if (sesion.telefono && !sesion.nombre) {
      return "Perfecto 🙌 ¿Cómo te llamas?";
    }

    if (t.includes("precio") || t.includes("presupuesto")) {
      return "Claro 😊 Para darte precio necesitamos tu nombre.";
    }

    if (t.includes("hola")) {
      return "¡Hola! 😊 ¿En qué tratamiento estás interesado?";
    }

    if (sesion.nombre && !sesion.telefono) {
      return `Encantados ${sesion.nombre} 😊 ¿Nos dejas tu teléfono?`;
    }

    return "¿Te gustaría que te llamemos para informarte mejor?";
  }
})();