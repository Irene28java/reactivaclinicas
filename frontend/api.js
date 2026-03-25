/* ═══════════════════════════════════════════════════
   ReActiva · API Integration Layer
   Conecta panel.html ↔ Railway backend
   ─────────────────────────────────────────────────
   Uso: incluir ANTES del script principal del panel
   <script src="api.js"></script>
═══════════════════════════════════════════════════ */

(function () {

  /* ─────────────────────────────────────────────
     CONFIGURACIÓN — cambia solo la URL base
  ───────────────────────────────────────────── */
  const API_BASE = window.REACTIVA_API_URL || "https://TU-APP.up.railway.app";

  /* ─────────────────────────────────────────────
     TOKEN JWT — se guarda en localStorage
  ───────────────────────────────────────────── */
  const Auth = {
    getToken()        { return localStorage.getItem("ra_token"); },
    setToken(t)       { localStorage.setItem("ra_token", t); },
    clearToken()      { localStorage.removeItem("ra_token"); },
    isLogged()        { return !!this.getToken(); },
    getClinicId()     {
      const t = this.getToken();
      if (!t) return null;
      try {
        const payload = JSON.parse(atob(t.split(".")[1]));
        return payload.id || payload.clinic_id || null;
      } catch { return null; }
    },
    getClinicName()   {
      const t = this.getToken();
      if (!t) return null;
      try {
        const payload = JSON.parse(atob(t.split(".")[1]));
        return payload.clinic_name || null;
      } catch { return null; }
    }
  };

  /* ─────────────────────────────────────────────
     FETCH HELPER con auth automático
  ───────────────────────────────────────────── */
  async function apiFetch(path, options = {}) {
    const token = Auth.getToken();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers["Authorization"] = "Bearer " + token;

    const res = await fetch(API_BASE + path, { ...options, headers });

    if (res.status === 401 || res.status === 403) {
      Auth.clearToken();
      showLoginModal();
      throw new Error("No autorizado");
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Error de red" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  /* ═══════════════════════════════════════════
     API METHODS
  ═══════════════════════════════════════════ */
  window.ReActivaAPI = {

    /* ── AUTH ── */
    async requestOTP(email) {
      return apiFetch("/api/request-otp", { method: "POST", body: JSON.stringify({ email }) });
    },
    async verifyOTP(email, code) {
      const data = await apiFetch("/api/verify-otp", { method: "POST", body: JSON.stringify({ email, code }) });
      if (data.token) Auth.setToken(data.token);
      return data;
    },
    logout() {
      Auth.clearToken();
      showLoginModal();
    },
    isLogged:    () => Auth.isLogged(),
    getClinicId: () => Auth.getClinicId(),

    /* ── LEADS ── */
    async getLeads(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return apiFetch("/api/leads" + (qs ? "?" + qs : ""));
    },
    async createLead(lead) {
      return apiFetch("/api/leads", { method: "POST", body: JSON.stringify(lead) });
    },
    async updateLead(id, data) {
      return apiFetch("/api/leads/" + id, { method: "PUT", body: JSON.stringify(data) });
    },
    async deleteLead(id) {
      return apiFetch("/api/leads/" + id, { method: "DELETE" });
    },

    /* ── CITAS ── */
    async getCitas(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return apiFetch("/api/citas" + (qs ? "?" + qs : ""));
    },
    async createCita(cita) {
      return apiFetch("/api/citas", { method: "POST", body: JSON.stringify(cita) });
    },
    async deleteCita(id) {
      return apiFetch("/api/citas/" + id, { method: "DELETE" });
    },

    /* ── CHAT BOT ── */
    async chat(message, sessionId) {
      const clinicId = Auth.getClinicId();
      return apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message, sessionId, canal: "web", clinicId })
      });
    },

    /* ── DASHBOARD ── */
    async getDashboard() {
      return apiFetch("/api/dashboard");
    }
  };

  /* ─────────────────────────────────────────────
     MODAL DE LOGIN
  ───────────────────────────────────────────── */
  function buildLoginModal() {
    if (document.getElementById("loginModal")) return;

    const el = document.createElement("div");
    el.id = "loginModal";
    el.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      background:rgba(7,9,13,0.97);backdrop-filter:blur(18px);
      display:flex;align-items:center;justify-content:center;
      font-family:'Syne',sans-serif;
    `;
    el.innerHTML = `
      <div style="width:380px;background:#0f1318;border:1px solid rgba(0,230,118,0.2);border-radius:22px;padding:36px;position:relative;overflow:hidden">
        <!-- Glow -->
        <div style="position:absolute;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(0,230,118,.08) 0%,transparent 70%);top:-80px;right:-60px;pointer-events:none"></div>

        <!-- Logo -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:30px">
          <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
            <rect width="64" height="64" rx="14" fill="#00e676" fill-opacity="0.1"/>
            <rect width="64" height="64" rx="14" stroke="#00e676" stroke-opacity="0.25" stroke-width="1.5"/>
            <circle cx="40" cy="22" r="8.5" fill="#00e676" fill-opacity="0.88"/>
            <rect x="22" y="40" width="6" height="8" rx="1.5" fill="#00e676" opacity="0.45"/>
            <rect x="30" y="34" width="6" height="14" rx="1.5" fill="#00e676" opacity="0.7"/>
            <rect x="38" y="28" width="6" height="20" rx="1.5" fill="#00e676"/>
            <polyline points="36,18 39.5,22 47,14" stroke="#07090d" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span style="font-family:'Cormorant Garamond',serif;font-size:1.4rem;font-weight:700;color:#f0ede8">Re<span style="color:#00e676;font-weight:400">Activa</span><span style="color:#00e676">.</span></span>
        </div>

        <div id="loginStep1">
          <div style="font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#00e676;margin-bottom:8px">Accede a tu panel</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:1.4rem;font-weight:700;color:#f0ede8;margin-bottom:6px">Introduce tu email</div>
          <div style="font-size:.78rem;color:#6e7a8a;margin-bottom:22px">Te enviaremos un código de acceso seguro.</div>
          <input id="loginEmail" type="email" placeholder="hola@tuclinica.com"
            style="width:100%;padding:12px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:12px;color:#f0ede8;font-family:'Syne',sans-serif;font-size:.88rem;outline:none;margin-bottom:12px;transition:border-color .2s"
            onfocus="this.style.borderColor='rgba(0,230,118,.4)'"
            onblur="this.style.borderColor='rgba(255,255,255,.09)'"
            onkeydown="if(event.key==='Enter')window._loginSendOTP()">
          <button onclick="window._loginSendOTP()"
            style="width:100%;padding:13px;background:#00e676;border:none;border-radius:12px;font-family:'Syne',sans-serif;font-size:.88rem;font-weight:700;color:#07090d;cursor:pointer;transition:all .2s"
            onmouseover="this.style.background='#1fffa0';this.style.boxShadow='0 6px 20px rgba(0,230,118,.4)'"
            onmouseout="this.style.background='#00e676';this.style.boxShadow='none'">
            Enviar código →
          </button>
          <div id="loginStep1Error" style="font-size:.72rem;color:#ff5c5c;margin-top:10px;display:none"></div>
        </div>

        <div id="loginStep2" style="display:none">
          <div style="font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#00e676;margin-bottom:8px">Código enviado</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:1.4rem;font-weight:700;color:#f0ede8;margin-bottom:6px">Revisa tu email</div>
          <div style="font-size:.78rem;color:#6e7a8a;margin-bottom:22px">Introduce el código de 6 dígitos que te hemos enviado a <span id="loginEmailDisplay" style="color:#f0ede8;font-weight:600"></span></div>
          <input id="loginCode" type="text" inputmode="numeric" maxlength="6" placeholder="000000"
            style="width:100%;padding:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:12px;color:#f0ede8;font-family:'Syne',sans-serif;font-size:1.4rem;letter-spacing:.25em;text-align:center;outline:none;margin-bottom:12px;transition:border-color .2s"
            onfocus="this.style.borderColor='rgba(0,230,118,.4)'"
            onblur="this.style.borderColor='rgba(255,255,255,.09)'"
            onkeydown="if(event.key==='Enter')window._loginVerifyOTP()">
          <button onclick="window._loginVerifyOTP()"
            style="width:100%;padding:13px;background:#00e676;border:none;border-radius:12px;font-family:'Syne',sans-serif;font-size:.88rem;font-weight:700;color:#07090d;cursor:pointer;transition:all .2s"
            onmouseover="this.style.background='#1fffa0'"
            onmouseout="this.style.background='#00e676'">
            Entrar al panel →
          </button>
          <button onclick="window._loginBack()"
            style="width:100%;padding:10px;background:none;border:none;color:#6e7a8a;font-family:'Syne',sans-serif;font-size:.78rem;cursor:pointer;margin-top:8px">
            ← Cambiar email
          </button>
          <div id="loginStep2Error" style="font-size:.72rem;color:#ff5c5c;margin-top:10px;display:none"></div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
  }

  function showLoginModal() {
    buildLoginModal();
    document.getElementById("loginModal").style.display = "flex";
  }

  function hideLoginModal() {
    const m = document.getElementById("loginModal");
    if (m) m.style.display = "none";
  }

  /* Login handlers (globales para onclick inline) */
  window._loginSendOTP = async function () {
    const email = document.getElementById("loginEmail").value.trim();
    const errEl = document.getElementById("loginStep1Error");
    errEl.style.display = "none";
    if (!email) { errEl.textContent = "Introduce un email válido."; errEl.style.display = "block"; return; }
    try {
      await window.ReActivaAPI.requestOTP(email);
      document.getElementById("loginEmailDisplay").textContent = email;
      document.getElementById("loginStep1").style.display = "none";
      document.getElementById("loginStep2").style.display = "block";
      setTimeout(() => document.getElementById("loginCode")?.focus(), 100);
    } catch (e) {
      errEl.textContent = e.message || "Error enviando el código.";
      errEl.style.display = "block";
    }
  };

  window._loginVerifyOTP = async function () {
    const email = document.getElementById("loginEmail").value.trim();
    const code  = document.getElementById("loginCode").value.trim();
    const errEl = document.getElementById("loginStep2Error");
    errEl.style.display = "none";
    if (code.length < 6) { errEl.textContent = "El código tiene 6 dígitos."; errEl.style.display = "block"; return; }
    try {
      await window.ReActivaAPI.verifyOTP(email, code);
      hideLoginModal();
      // Recargar datos desde backend después del login
      if (window.initFromBackend) window.initFromBackend();
    } catch (e) {
      errEl.textContent = e.message || "Código incorrecto.";
      errEl.style.display = "block";
    }
  };

  window._loginBack = function () {
    document.getElementById("loginStep1").style.display = "block";
    document.getElementById("loginStep2").style.display = "none";
    document.getElementById("loginStep1Error").style.display = "none";
  };

  /* ─────────────────────────────────────────────
     SYNC: sobreescribe funciones del panel.html
     para que hablen con el backend en lugar de
     solo con localStorage
  ───────────────────────────────────────────── */
  function patchPanel() {

    /* ── LEADS ── */

    // addLead: crea en backend + local
    const _origAddLead = window.addLead;
    window.addLead = async function (name, message, phone, servicio, status = "new") {
      // Optimistic local update primero (UX rápida)
      const local = _origAddLead ? _origAddLead(name, message, phone, servicio, status) : null;

      if (window.ReActivaAPI.isLogged()) {
        try {
          const data = await window.ReActivaAPI.createLead({ name, message, phone, servicio, status, canal: "web" });
          // Sustituir ID local por el del backend si existe
          if (data && data.id && window.allLeads && window.allLeads[0]) {
            window.allLeads[0].id = String(data.id);
            window.saveLeads();
          }
        } catch (e) { console.warn("Lead no sincronizado:", e.message); }
      }
      return local;
    };

    // convertLead: actualiza en backend
    const _origConvertLead = window.convertLead;
    window.convertLead = async function (id, btn) {
      if (_origConvertLead) _origConvertLead(id, btn);
      if (window.ReActivaAPI.isLogged()) {
        try { await window.ReActivaAPI.updateLead(id, { status: "closed" }); }
        catch (e) { console.warn("Update lead backend:", e.message); }
      }
    };

    // delLead: elimina en backend
    const _origDelLead = window.delLead;
    window.delLead = async function (id) {
      if (_origDelLead) _origDelLead(id);
      if (window.ReActivaAPI.isLogged()) {
        try { await window.ReActivaAPI.deleteLead(id); }
        catch (e) { console.warn("Delete lead backend:", e.message); }
      }
    };

    /* ── CITAS ── */

    const _origAgregarCita = window.agregarCita;
    window.agregarCita = async function () {
      const fecha    = document.getElementById("citaFecha")?.value;
      const hora     = document.getElementById("citaHora")?.value;
      const paciente = document.getElementById("citaPaciente")?.value?.trim();
      const telefono = document.getElementById("citaTelefono")?.value?.trim();
      const servicio = document.getElementById("citaServicio")?.value;

      // Local primero
      if (_origAgregarCita) _origAgregarCita();

      if (window.ReActivaAPI.isLogged() && fecha && hora && paciente) {
        try {
          await window.ReActivaAPI.createCita({ fecha, hora, paciente, telefono, servicio });
        } catch (e) { console.warn("Cita no sincronizada:", e.message); }
      }
    };

    const _origDelCita = window.delCita;
    window.delCita = async function (id) {
      if (_origDelCita) _origDelCita(id);
      if (window.ReActivaAPI.isLogged()) {
        try { await window.ReActivaAPI.deleteCita(id); }
        catch (e) { console.warn("Delete cita backend:", e.message); }
      }
    };

    /* ── CHAT BOT ── */

    const _origEnviarMensaje = window.enviarMensaje;
    window.enviarMensaje = async function () {
      const input = document.getElementById("chatInput");
      const text  = input?.value?.trim();
      if (!text) return;

      // Mostrar mensaje del usuario
      if (typeof window.addUserMsg === "function") window.addUserMsg(text);
      if (input) input.value = "";
      if (typeof window.clearQR === "function") window.clearQR();

      const btn = document.getElementById("chatSendBtn");
      if (btn) btn.disabled = true;

      // Typing indicator
      let typingEl = null;
      if (typeof window.addTyping === "function") typingEl = window.addTyping();

      if (window.ReActivaAPI.isLogged()) {
        /* Modo BACKEND real */
        try {
          const sessionId = localStorage.getItem("ra_session") || ("s_" + Date.now());
          localStorage.setItem("ra_session", sessionId);

          const data = await window.ReActivaAPI.chat(text, sessionId);
          if (typingEl) typingEl.remove();

          const reply = data.reply || data.message || "Un momento, ahora te respondo.";
          if (typeof window.addBotMsg === "function") window.addBotMsg(reply, []);
        } catch (e) {
          if (typingEl) typingEl.remove();
          // Fallback al motor local si el backend falla
          console.warn("Chat backend fallback:", e.message);
          if (_origEnviarMensaje) {
            if (input) input.value = text;
            _origEnviarMensaje();
          }
        }
      } else {
        /* Modo LOCAL (sin login) — motor híbrido original */
        if (typingEl) typingEl.remove();
        if (_origEnviarMensaje) {
          if (input) input.value = text;
          _origEnviarMensaje();
          return;
        }
      }

      if (btn) btn.disabled = false;
    };
  }

  /* ─────────────────────────────────────────────
     CARGA INICIAL DESDE BACKEND
  ───────────────────────────────────────────── */
  window.initFromBackend = async function () {
    if (!window.ReActivaAPI.isLogged()) { showLoginModal(); return; }

    try {
      /* Dashboard */
      const dash = await window.ReActivaAPI.getDashboard().catch(() => null);
      if (dash) {
        // Merge con estado local
        console.log("📊 Dashboard backend:", dash);
      }

      /* Leads */
      const leadsData = await window.ReActivaAPI.getLeads({ limit: 200 }).catch(() => null);
      if (leadsData) {
        const arr = Array.isArray(leadsData) ? leadsData : leadsData.leads || leadsData.data || [];
        if (arr.length) {
          window.allLeads = arr.map(l => ({
            id:        String(l.id),
            name:      l.name || l.nombre || "",
            message:   l.message || l.mensaje || "",
            phone:     l.phone || l.telefono || "",
            servicio:  l.servicio || l.service || "",
            status:    l.status || l.estado || "new",
            timestamp: l.timestamp || l.created_at || l.createdAt || new Date().toISOString()
          }));
          window.saveLeads();
          if (typeof window.refreshDashboard === "function") window.refreshDashboard();
          console.log(`✅ ${arr.length} leads cargados desde backend`);
        }
      }

      /* Citas */
      const citasData = await window.ReActivaAPI.getCitas().catch(() => null);
      if (citasData) {
        const arr = Array.isArray(citasData) ? citasData : citasData.citas || citasData.data || [];
        if (arr.length) {
          window.citas = arr.map(c => ({
            id:       String(c.id),
            fecha:    c.fecha || c.date || "",
            hora:     c.hora || c.time || "",
            paciente: c.paciente || c.patient_name || c.name || "",
            telefono: c.telefono || c.phone || "",
            servicio: c.servicio || c.service || "",
            notas:    c.notas || c.notes || "",
            creada:   c.creada || c.created_at || new Date().toISOString()
          }));
          window.saveCitas();
          if (typeof window.renderCitasPanel === "function") window.renderCitasPanel();
          if (typeof window.renderCal === "function") { window.renderCal("bot"); window.renderCal("citas"); }
          console.log(`✅ ${arr.length} citas cargadas desde backend`);
        }
      }
    } catch (e) {
      console.error("Error carga inicial backend:", e);
    }
  };

  /* ─────────────────────────────────────────────
     ARRANQUE
  ───────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", () => {
    // Dar tiempo al panel.html a definir sus funciones
    setTimeout(() => {
      patchPanel();
      if (Auth.isLogged()) {
        console.log("🔓 Sesión activa · clinicId:", Auth.getClinicId());
        window.initFromBackend();
      } else {
        console.log("🔒 Sin sesión → mostrando login");
        showLoginModal();
      }
    }, 300);
  });

})();