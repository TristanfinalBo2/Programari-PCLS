import { auth, db } from "./firebase-config.js";
import { signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const AUTH_ORIGIN = "https://programari-pcls.vercel.app";

function setMessage(text, color = "var(--accent-green)") {
  const el = document.getElementById("mesaj");
  if (!el) return;
  el.style.color = color;
  el.textContent = text;
}

function getProfileName(profile, discordName) {
  return String(profile?.nume || profile?.name || discordName || "Utilizator Discord").trim();
}

async function finishLogin(payload) {
  if (!payload?.token) throw new Error("Tokenul Discord lipsește.");
  setMessage("Se validează contul Discord...");

  const credential = await signInWithCustomToken(auth, payload.token);
  const user = credential.user;
  const userRef = doc(db, "utilizatori", user.uid);
  const snap = await getDoc(userRef);
  const existing = snap.exists() ? (snap.data() || {}) : {};
  const displayName = getProfileName(existing, payload.discordName);

  const profile = {
    nume: displayName,
    discordId: String(payload.discordId || existing.discordId || ""),
    ultimaLogare: serverTimestamp(),
    authProvider: "discord"
  };
  if (!existing.createdAt) profile.createdAt = serverTimestamp();
  if (!existing.stare) profile.stare = "Activ";
  if (!existing.role && !existing.rol) profile.role = "user";
  if (payload.discordEmail && !existing.email) profile.email = payload.discordEmail;

  await setDoc(userRef, profile, { merge: true });

  sessionStorage.setItem("pcls_discord_login_ok", "1");
  sessionStorage.setItem("pcls_discord_id", String(payload.discordId || ""));
  setMessage(`Conectat cu succes! Bun venit, ${displayName}`);
  window.location.replace("index.html");
}

function parseHashPayload() {
  const hash = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
  const token = hash.get("discord_token");
  if (!token) return null;
  return {
    token,
    discordId: hash.get("discord_id") || "",
    discordName: hash.get("discord_name") || ""
  };
}

async function handleCallbackHash() {
  const payload = parseHashPayload();
  if (!payload) return false;
  history.replaceState(null, document.title, window.location.pathname + window.location.search);
  try {
    await finishLogin(payload);
  } catch (error) {
    console.error("Discord custom auth callback:", error);
    setMessage(error?.message || "Autentificarea cu Discord a eșuat.", "var(--error)");
  }
  return true;
}

function initDiscordButton() {
  const original = document.getElementById("btnDiscordLogin");
  if (!original) return;

  // The legacy OIDC handler is installed by the inline auth script immediately after this module import.
  // Replace the button on the next task tick so the legacy listener is removed safely.
  setTimeout(() => {
    const current = document.getElementById("btnDiscordLogin");
    if (!current) return;
    const button = current.cloneNode(true);
    current.replaceWith(button);

    button.addEventListener("click", () => {
      if (button.disabled) return;
      button.disabled = true;
      setMessage("Se deschide Discord...");

      const width = 520;
      const height = 760;
      const left = Math.max(0, Math.round((window.screen.width - width) / 2));
      const top = Math.max(0, Math.round((window.screen.height - height) / 2));
      const popup = window.open(
        "/api/discord-auth",
        "pcls-discord-login",
        `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        window.location.href = "/api/discord-auth";
        return;
      }

      const timeout = window.setTimeout(() => {
        button.disabled = false;
      }, 120000);

      const onMessage = async event => {
        if (event.origin !== AUTH_ORIGIN) return;
        if (event.data?.type !== "PCLS_DISCORD_AUTH") return;
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        try {
          await finishLogin(event.data);
        } catch (error) {
          console.error("Discord custom auth:", error);
          button.disabled = false;
          setMessage(error?.message || "Autentificarea cu Discord a eșuat.", "var(--error)");
        }
      };
      window.addEventListener("message", onMessage);
    });
  }, 0);
}

(async function init() {
  if (window.location.pathname.toLowerCase().endsWith("/auth.html")) {
    const error = new URLSearchParams(window.location.search).get("discord_error");
    if (error) setMessage(error, "var(--error)");
    const handled = await handleCallbackHash();
    if (!handled) initDiscordButton();
  }
})();
