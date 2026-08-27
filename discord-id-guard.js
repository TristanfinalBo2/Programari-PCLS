import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const EXEMPT_PATHS = ["/auth.html", "/setari.html"];
const DISCORD_ID_RE = /^\d{17,20}$/;

function normalizePath() {
  const path = window.location.pathname.toLowerCase();
  return path.endsWith("/") ? "/index.html" : path;
}

function isExempt() {
  return EXEMPT_PATHS.includes(normalizePath());
}

function injectStyles() {
  if (document.getElementById("discord-id-guard-style")) return;
  const style = document.createElement("style");
  style.id = "discord-id-guard-style";
  style.textContent = `
    #discord-id-guard{position:fixed;inset:0;z-index:99999;display:none;place-items:center;padding:20px;background:rgba(2,4,10,.82);backdrop-filter:blur(18px)}
    #discord-id-guard.show{display:grid}
    .discord-id-guard-box{width:min(500px,100%);padding:28px;border-radius:26px;border:1px solid rgba(124,231,255,.15);background:linear-gradient(155deg,rgba(14,24,40,.99),rgba(4,9,18,.99));box-shadow:0 36px 100px rgba(0,0,0,.65);text-align:center}
    .discord-id-guard-icon{width:58px;height:58px;margin:0 auto 16px;display:grid;place-items:center;border-radius:18px;color:#9ee9ff;background:rgba(124,231,255,.07);border:1px solid rgba(124,231,255,.13);font-size:1.35rem}
    .discord-id-guard-title{font-size:1.2rem;font-weight:800;color:#f7fbff}
    .discord-id-guard-text{margin-top:10px;color:#aeb9ca;font-size:.84rem;line-height:1.6}
    .discord-id-guard-button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;margin-top:20px;padding:0 18px;border-radius:14px;border:1px solid rgba(124,231,255,.18);background:linear-gradient(110deg,rgba(76,141,255,.82),rgba(145,117,238,.76));color:#fff;text-decoration:none;font:inherit;font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em}
  `;
  document.head.appendChild(style);
}

function ensureOverlay() {
  let overlay = document.getElementById("discord-id-guard");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "discord-id-guard";
  overlay.innerHTML = `<div class="discord-id-guard-box" role="dialog" aria-modal="true"><div class="discord-id-guard-icon">◎</div><div class="discord-id-guard-title">Conectare Discord necesară</div><div class="discord-id-guard-text">Conectează-te cu Discord pentru ca ID-ul tău să fie preluat automat în acest formular.</div><a class="discord-id-guard-button" id="discord-id-guard-connect" href="#">Conectează Discord</a></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#discord-id-guard-connect")?.addEventListener("click", event => {
    event.preventDefault();
    window.location.href = `/api/discord-auth?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  });
  return overlay;
}

function showGuard() {
  ensureOverlay().classList.add("show");
  document.body.style.overflow = "hidden";
}

function hideGuard() {
  document.getElementById("discord-id-guard")?.classList.remove("show");
  document.body.style.overflow = "";
}

function setValue(input, value) {
  if (!input) return;
  input.value = value;
  input.setAttribute("value", value);
  input.dataset.pclsDiscordAuto = "true";
  input.readOnly = true;
  input.setAttribute("aria-readonly", "true");
}

function fillForms(profile) {
  const discordId = String(profile?.discordId || "").trim();
  if (!DISCORD_ID_RE.test(discordId)) return;
  const username = String(profile?.username || "").trim();

  window.PCLSSession = { discordId, username, name: username };

  document.querySelectorAll("form").forEach(form => {
    const fields = form.querySelectorAll('input[name="discord"], input[name="discord_id"], input[name="discordId"], #discordIdInput');
    if (fields.length) fields.forEach(input => setValue(input, discordId));
    else {
      let hidden = form.querySelector('input[type="hidden"][name="discordId"]');
      if (!hidden) {
        hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.name = "discordId";
        form.appendChild(hidden);
      }
      hidden.value = discordId;
    }
  });

  const pclsInput = document.getElementById("discordIdInput");
  const connectedBox = document.getElementById("discordConnectedBox");
  const loginBox = document.getElementById("discordLoginBox");
  const submit = document.getElementById("submit");
  if (pclsInput) setValue(pclsInput, discordId);
  if (connectedBox) connectedBox.style.display = "flex";
  if (loginBox) loginBox.style.display = "none";
  if (submit) submit.disabled = false;

  document.dispatchEvent(new CustomEvent("pcls:discord-session-ready", { detail: window.PCLSSession }));
}

function installConnectInterceptor() {
  document.addEventListener("click", event => {
    const button = event.target?.closest?.("#discordModalConnect, #discordIdConnect, #discordIdVerify, [data-discord-connect]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    window.location.href = `/api/discord-auth?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }, true);
}

async function getCookieSession() {
  try {
    const response = await fetch("/api/me", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => ({}));
    const discordId = String(data?.user?.discordId || "").trim();
    if (!response.ok || !data?.ok || !DISCORD_ID_RE.test(discordId)) return null;
    return { discordId, username: String(data.user.username || data.user.name || "").trim() };
  } catch (error) {
    console.error("Discord cookie session:", error);
    return null;
  }
}

async function getFirebaseProfile(user) {
  if (!user || !getApps().length) return null;
  try {
    const db = getFirestore(getApp());
    const snap = await getDoc(doc(db, "utilizatori", user.uid));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    const discordId = String(data.discordId || data.discord_id || "").trim();
    if (!DISCORD_ID_RE.test(discordId)) return null;
    return { discordId, username: String(data.discordUsername || data.numeDiscord || data.nume || user.displayName || "").trim() };
  } catch (error) {
    console.error("Discord Firebase profile:", error);
    return null;
  }
}

async function syncIdentity(firebaseUser = null) {
  if (isExempt()) return;
  injectStyles();
  const profile = await getCookieSession() || await getFirebaseProfile(firebaseUser);
  if (profile) {
    fillForms(profile);
    hideGuard();
    return true;
  }
  showGuard();
  return false;
}

async function boot() {
  if (isExempt()) return;
  installConnectInterceptor();
  const connected = await syncIdentity();
  if (getApps().length) {
    const auth = getAuth(getApp());
    onAuthStateChanged(auth, user => { if (!connected || user) void syncIdentity(user); });
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { void boot(); }, { once: true });
else void boot();
