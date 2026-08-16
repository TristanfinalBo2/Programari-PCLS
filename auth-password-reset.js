import { auth } from "./firebase-config.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

function injectStyles() {
  if (document.getElementById("auth-password-reset-style")) return;
  const style = document.createElement("style");
  style.id = "auth-password-reset-style";
  style.textContent = `
    .forgot-password-wrap{display:flex;justify-content:flex-end;margin-top:-6px;margin-bottom:14px}
    #forgot-password-btn{border:0;background:transparent;color:#8edfff;font:600 .76rem/1.3 inherit;cursor:pointer;padding:4px 2px;text-decoration:none;transition:color .2s ease,opacity .2s ease}
    #forgot-password-btn:hover{color:#fff}
    #forgot-password-btn:disabled{opacity:.55;cursor:wait}
    #forgot-password-status{display:none;margin-top:10px;padding:11px 13px;border-radius:12px;font-size:.76rem;line-height:1.45}
    #forgot-password-status.show{display:block}
    #forgot-password-status.success{color:#d4ffef;background:rgba(53,242,173,.07);border:1px solid rgba(53,242,173,.15)}
    #forgot-password-status.error{color:#ffd8dc;background:rgba(255,113,133,.07);border:1px solid rgba(255,113,133,.16)}
  `;
  document.head.appendChild(style);
}

function init() {
  if (!window.location.pathname.toLowerCase().endsWith("/auth.html")) return;
  if (document.getElementById("forgot-password-btn")) return;

  const passwordInput = document.getElementById("parola");
  const emailInput = document.getElementById("email");
  if (!passwordInput || !emailInput) return;

  injectStyles();

  const wrap = document.createElement("div");
  wrap.className = "forgot-password-wrap";
  wrap.innerHTML = `<button type="button" id="forgot-password-btn">Ai uitat parola?</button>`;
  passwordInput.closest(".input-group, .form-group, .form-field")?.insertAdjacentElement("afterend", wrap) || passwordInput.parentElement?.insertAdjacentElement("afterend", wrap);

  const status = document.createElement("div");
  status.id = "forgot-password-status";
  wrap.insertAdjacentElement("afterend", status);

  const button = document.getElementById("forgot-password-btn");
  const showStatus = (message, type) => {
    status.textContent = message;
    status.className = `show ${type}`;
  };

  button.addEventListener("click", async () => {
    const email = String(emailInput.value || "").trim();
    status.className = "";
    status.textContent = "";

    if (!email) {
      emailInput.focus();
      showStatus("Introdu adresa de email a contului, apoi apasă din nou pe «Ai uitat parola?». ", "error");
      return;
    }

    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Se trimite…";

    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/auth.html`,
        handleCodeInApp: true
      };
      await sendPasswordResetEmail(auth, email, actionCodeSettings);
      showStatus("Am trimis un email privat de resetare. Verifică inbox-ul și folderul Spam/Junk.", "success");
    } catch (error) {
      console.error("Password reset:", error);
      const code = String(error?.code || "");
      if (code === "auth/invalid-email") {
        showStatus("Adresa de email nu este validă.", "error");
      } else if (code === "auth/user-not-found") {
        showStatus("Nu există un cont cu această adresă de email.", "error");
      } else if (code === "auth/operation-not-allowed") {
        showStatus("Resetarea parolei prin email nu este activată pentru acest proiect Firebase.", "error");
      } else {
        showStatus("Nu am putut trimite emailul de resetare. Încearcă din nou peste câteva secunde.", "error");
      }
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
