import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const mounted = new Set();
let unsubscribe = null;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function requestUrl(item) {
  return item.requestUrl || (item.requestId ? `cererile_mele.html?cerere=${encodeURIComponent(item.requestId)}` : "notificari.html");
}

function isRejection(item) {
  const status = String(item.status || "").toLowerCase();
  const type = String(item.type || "").toLowerCase();
  const title = String(item.title || "").toLowerCase();
  return ["respins", "respinsa", "rejected"].includes(status)
    || type === "error"
    || title.includes("respins");
}

function toMillis(value) {
  try {
    if (value?.toDate) return value.toDate().getTime();
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  } catch (_) { return 0; }
}

function relative(value) {
  const ms = toMillis(value);
  if (!ms) return "acum";
  const minutes = Math.floor(Math.max(0, Date.now() - ms) / 60000);
  if (minutes < 1) return "acum";
  if (minutes < 60) return `acum ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `acum ${hours} h`;
  return `acum ${Math.floor(hours / 24)} zile`;
}

function itemHtml(item) {
  const id = esc(item.id);
  const url = esc(requestUrl(item));
  const readClass = item.read === true ? "" : "unread";
  return `
    <article class="notification-item error ${readClass} rejection-bridge-item" data-id="${id}" data-url="${url}">
      ${item.read === true ? "" : '<span class="notification-unread-dot"></span>'}
      <div class="notification-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="m9 9 6 6"></path><path d="m15 9-6 6"></path></svg></div>
      <div class="notification-copy">
        <strong>${esc(item.title || "Cererea a fost respinsă")}</strong>
        <p>${esc(item.message || "Cererea ta a fost respinsă.")}</p>
        <small>${esc(relative(item.createdAt))}${item.actorName ? ` · ${esc(item.actorName)}` : ""}</small>
      </div>
      <a class="notification-open" href="${url}" aria-label="Deschide notificarea"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"></path><path d="M7 7h10v10"></path></svg></a>
    </article>`;
}

function ensureStyle() {
  if (document.getElementById("rejection-notification-bridge-style")) return;
  const style = document.createElement("style");
  style.id = "rejection-notification-bridge-style";
  style.textContent = `.rejection-bridge-item{border-color:rgba(255,105,97,.18)!important;background:linear-gradient(145deg,rgba(255,105,97,.065),rgba(255,255,255,.025))!important}`;
  document.head.appendChild(style);
}

async function getDiscordId(user) {
  try {
    const snap = await getDoc(doc(db, "utilizatori", user.uid));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    return String(data.discordId || data.discord_id || data.discord || data.numeDiscord || "").trim() || null;
  } catch (error) {
    console.warn("Rejection notification bridge profile lookup:", error);
    return null;
  }
}

function renderBridgeItem(item) {
  if (!isRejection(item)) return;
  const list = document.getElementById("notificationList");
  if (!list) return;
  if (list.querySelector(`[data-id="${CSS.escape(String(item.id))}"]`)) return;

  const empty = list.querySelector(".notification-empty");
  if (empty) empty.remove();
  list.insertAdjacentHTML("afterbegin", itemHtml(item));

  const badge = document.getElementById("notificationBadge");
  const toggle = document.getElementById("notificationToggle");
  if (item.read !== true) {
    const current = Math.max(0, Number.parseInt(badge?.textContent || "0", 10) || 0);
    if (badge) {
      badge.hidden = false;
      badge.textContent = String(current + 1);
    }
    toggle?.classList.add("has-new");
  }
}

function bindClickHandling() {
  const list = document.getElementById("notificationList");
  if (!list || list.dataset.rejectionBridgeBound === "true") return;
  list.dataset.rejectionBridgeBound = "true";
  list.addEventListener("click", async event => {
    const item = event.target.closest(".rejection-bridge-item");
    if (!item) return;
    const id = item.dataset.id;
    if (id) {
      try { await updateDoc(doc(db, "notificari", id), { read: true }); } catch (error) { console.error("rejection notification read", error); }
    }
  });
}

function observeForPopup(item) {
  bindClickHandling();
  renderBridgeItem(item);
}

async function startForUser(user) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (!user) return;
  ensureStyle();

  const discordId = await getDiscordId(user);
  if (!discordId) return;

  const q = query(collection(db, "notificari"), where("recipientDiscordId", "==", discordId));
  unsubscribe = onSnapshot(q, snapshot => {
    snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(isRejection)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
      .forEach(observeForPopup);
  }, error => console.error("Rejection notification bridge:", error));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    mounted.add("dom");
    onAuthStateChanged(auth, startForUser);
  }, { once: true });
} else {
  onAuthStateChanged(auth, startForUser);
}
