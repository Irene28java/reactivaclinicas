//frontend>script.js
function extraerTelefono(text){
    const regex = /(\+?\d{9,15})/;
    const match = text.match(regex);
    return match ? match[0] : null;
}

function extraerNombre(text){
    const regex = /soy\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)/i;
    const match = text.match(regex);
    return match ? match[1] : null;
}

function generarRespuestaBot(text){
    const telefono = extraerTelefono(text);
    const nombre = extraerNombre(text);
    text = text.toLowerCase();
    if(telefono) return "Perfecto 🙌 Hemos recibido tu número. Te llamaremos hoy mismo.";
    if(text.includes("precio") || text.includes("cuanto")) return "Claro 🙌 Para enviarte presupuesto necesitamos tu nombre y teléfono.";
    if(text.includes("blanqueamiento")) return "Sí, realizamos blanqueamiento profesional. Déjanos tu nombre y teléfono.";
    if(nombre) return `Encantados ${nombre} 🙌 Ahora necesitamos tu número para poder llamarte.`;
    return "Gracias por tu mensaje 🙌 ¿Te gustaría que te llamemos para informarte mejor?";
}

// Chat landing page
document.addEventListener("DOMContentLoaded", function(){
  const chatDemo = document.getElementById("chatDemo");
  const chatInput = document.getElementById("chatInput");
  if(!chatInput) return;

  setTimeout(()=>{ 
      const welcome = document.createElement("div");
      welcome.className="chat-message bot";
      welcome.textContent="Hola 👋 ¿En qué podemos ayudarte hoy?";
      chatDemo.appendChild(welcome);
  },800);

  chatInput.addEventListener("keypress", async function(e){
      if(e.key==="Enter" && chatInput.value.trim()!==""){
          const userText = chatInput.value;
          const telefono = extraerTelefono(userText);
          const nombre = extraerNombre(userText);

          const userMsg = document.createElement("div");
          userMsg.className="chat-message user";
          userMsg.textContent = userText;
          chatDemo.appendChild(userMsg);
          chatInput.value="";
          chatDemo.scrollTop = chatDemo.scrollHeight;

          try{
              await fetch(`${BACKEND_URL}/api/leads`,{
                  method:"POST",
                  headers:{
                      "Content-Type":"application/json",
                      ...(TOKEN && {"Authorization": `Bearer ${TOKEN}`})
                  },
                  body:JSON.stringify({
                      message:userText,
                      phone:telefono,
                      name:nombre,
                      timestamp:new Date().toISOString()
                  })
              });
          }catch(err){ console.log("Error enviando lead", err); }

          setTimeout(()=>{
              const botMsg = document.createElement("div");
              botMsg.className="chat-message bot";
              botMsg.textContent = generarRespuestaBot(userText);
              chatDemo.appendChild(botMsg);
              chatDemo.scrollTop = chatDemo.scrollHeight;
          },700);
      }
  });
});