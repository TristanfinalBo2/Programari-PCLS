import { getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const PRESENCE_WINDOW_MS = 90000;
let usersByUid = new Map();
let initialized = false;

function isActive(data = {}) {
  return data.activ !== false && data.active !== false && data.enabled !== false;
}

function isSuspended(data = {}) {
  return data.suspendat === true || data.suspended === true || String(data.status || "").trim().toLowerCase() === "suspendat";
}

function lastSeenMs(value) {
  if (!value) return 0;
  try {
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch (_) { return 0; }
}

function presenceFor(data = {}) {
  if (isSuspended(data)) return { key: "suspended", label: "Suspendat", className: "suspended" };
  if (!isActive(data)) return { key: "inactive", label: "Inactiv", className: "off" };
  const seen = lastSeenMs(data.lastSeen);
  const online = data.online === true && seen > 0 && (Date.now() - seen) <= PRESENCE_WINDOW_MS;
  return online
    ? { key: "online", label: "Online", className: "online" }
    : { key: "active", label: "Activ", className: "active" };
}

function injectStyles() {
  if (document.getElementById("um-presence-style")) return;
  const style = document.createElement("style");
  style.id = "um-presence-style";
  style.textContent = `
    .umv2-presence{display:inline-flex;align-items:center;gap:5px;min-height:20px;padding:0 7px;border-radius:999px;font-size:.56rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;border:1px solid rgba(255,255,255,.08)}
    .umv2-presence::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}
    .umv2-presence.online{color:#63e6be;background:rgba(99,230,190,.08);border-color:rgba(99,230,190,.14)}
    .umv2-presence.active{color:#64d2ff;background:rgba(100,210,255,.07);border-color:rgba(100,210,255,.12)}
    .umv2-presence.off{color:#ff6961;background:rgba(255,105,97,.07);border-color:rgba(255,105,97,.12)}
    .umv2-presence.suspended{color:#ffd60a;background:rgba(255,214,10,.07);border-color:rgba(255,214,10,.14)}
    .umv2-presence-box{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:7px}
    .umv2-last-seen{color:var(--text-3);font-size:.58rem}
  `;
  document.head.appendChild(style);
}

function formatLastSeen(value) {
  const ms = lastSeenMs(value);
  if (!ms) return "Fără activitate";
  const diff = Math.max(0, Date.now() - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "acum";
  if (min < 60) return `acum ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `acum ${hours} h`;
  return new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

function patchRows() {
  document.querySelectorAll("#umv2-items .umv2-row[data-uid]").forEach(row => {
    const uid = row.dataset.uid;
    const data = usersByUid.get(uid);
    if (!data) return;
    const meta = row.querySelector(".umv2-meta");
    if (!meta) return;
    const presence = presenceFor(data);
    let badge = meta.querySelector(".umv2-presence");
    if (!badge) {
      badge = document.createElement("span");
      meta.appendChild(badge);
    }
    badge.className = `umv2-presence ${presence.className}`;
    badge.textContent = presence.label;

    const legacy = meta.querySelector(".umv2-status");
    if (legacy) legacy.style.display = "none";
  });

  const selected = document.querySelector("#umv2 .umv2-row.selected")?.dataset?.uid;
  if (!selected) return;
  const detail = document.getElementById("umv2-detail");
  const data = usersByUid.get(selected);
  if (!detail || !data) return;
  const profileBadges = detail.querySelector(".umv2-badges");
  if (!profileBadges) return;

  const presence = presenceFor(data);
  let badge = profileBadges.querySelector(".umv2-presence");
  if (!badge) {
    badge = document.createElement("span");
    profileBadges.appendChild(badge);
  }
  badge.className = `umv2-presence ${presence.className}`;
  badge.textContent = presence.label;

  let lastSeen = detail.querySelector(".umv2-last-seen");
  if (!lastSeen) {
    const host = profileBadges.parentElement;
    if (host) {
      lastSeen = document.createElement("div");
      lastSeen.className = "umv2-last-seen";
      host.appendChild(lastSeen);
    }
  }
  if (lastSeen) lastSeen.textContent = `Ultima activitate: ${formatLastSeen(data.lastSeen)}`;
}

function boot() {
  if (initialized || !document.getElementById("userManagementCard")) return;
  initialized = true;
  injectStyles();

  const db = getFirestore(getApp());
  onSnapshot(collection(db, "utilizatori"), snapshot => {
    const next = new Map();
    snapshot.forEach(item => next.set(item.id, item.data() || {}));
    usersByUid = next;
    patchRows();
  }, error => console.debug("Prezență utilizatori indisponibilă:", error?.message || error));

  const observer = new MutationObserver(patchRows);
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(patchRows, 30000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
