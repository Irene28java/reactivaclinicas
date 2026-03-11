const BACKEND_URL = "https://reactivaclinicas-production.up.railway.app";

document.addEventListener("DOMContentLoaded", function () {
    const chatDemo  = document.getElementById("chatDemo");
    const chatInput = document.getElementById("chatInput");
    if (!chatInput) return;

    // ID único por sesión para que el bot recuerde el contexto
    const sessionId = "web_" + Math.random().toString(36).substr(2, 9);

    setTimeout(() => {
        const welcome = document.createElement("div");
        welcome.className = "chat-message bot";
        welcome.textContent = "Hola 👋 ¿En qué podemos ayudarte hoy?";
        chatDemo.appendChild(welcome);
    }, 800);

    chatInput.addEventListener("keypress", async function (e) {
        if (e.key !== "Enter" || chatInput.value.trim() === "") return;

        const userText  = chatInput.value.trim();
        chatInput.value = "";

        // Mensaje del usuario
        const userMsg = document.createElement("div");
        userMsg.className   = "chat-message user";
        userMsg.textContent = userText;
        chatDemo.appendChild(userMsg);
        chatDemo.scrollTop = chatDemo.scrollHeight;

        // Indicador de escritura
        const typing = document.createElement("div");
        typing.className   = "chat-message bot";
        typing.textContent = "...";
        chatDemo.appendChild(typing);
        chatDemo.scrollTop = chatDemo.scrollHeight;

        try {
            const res  = await fetch(`${BACKEND_URL}/api/chat`, {
                method : "POST",
                headers: { "Content-Type": "application/json" },
                body   : JSON.stringify({ message: userText, sessionId })
            });
            const data = await res.json();
            typing.textContent = data.reply || "Gracias por tu mensaje 🙌";
        } catch (err) {
            typing.textContent = "Ha habido un problema de conexión. Inténtalo de nuevo 😊";
            console.error("Error chat:", err);
        }

        chatDemo.scrollTop = chatDemo.scrollHeight;
    });
});