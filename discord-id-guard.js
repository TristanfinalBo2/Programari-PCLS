import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const EXEMPT_PATHS = ["/auth.html", "/setari.html"];
const normalizePath = () => {
  const path = window.location.pathname.toLowerCase();
  return path.endsWith("/") ? "/index.html" : path;
};
const isExempt = () => EXEMPT_PATHS.includes(normalizePath());

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
  overlay.innerHTML = `<div class="discord-id-guard-box" role="dialog" aria-modal="true"><div class="discord-id-guard-icon">◎</div><div class="discord-id-guard-title">Completează Discord ID</div><div class="discord-id-guard-text">Pentru identificarea corectă a membrilor, contul tău trebuie să aibă un Discord ID salvat în profil. Completează-l în Setări înainte de a continua.</div><a class="discord-id-guard-button" href="setari.html">Deschide Setări</a></div>`;
  document.body.appendChild(overlay);
  return overlay;
}

async function verifyProfile(user) {
  if (!user || isExempt() || !getApps().length) return;
  injectStyles();
  try {
    const db = getFirestore(getApp());
    const snap = await getDoc(doc(db, "utilizatori", user.uid));
    const discordId = String(snap.data()?.discordId || snap.data()?.discord_id || "").trim();
    const overlay = ensureOverlay();
    const valid = /^\d{17,20}$/.test(discordId);
    overlay.classList.toggle("show", !valid);
    document.body.style.overflow = valid ? "" : "hidden";
  } catch (error) {
    console.error("Discord ID guard:", error);
  }
}

function boot() {
  if (!getApps().length || isExempt()) return;
  const auth = getAuth(getApp());
  onAuthStateChanged(auth, user => { void verifyProfile(user); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
