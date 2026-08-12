import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const CARD_ID = "userManagementCard";
const STATUS_ID = "userStatus";
const ROLES = ["admin", "superadmin", "conducere", "isuls", "dsls", "mmls", "ssmls"];

let currentUser = null;
let currentUserData = null;
let users = [];
let selectedUid = null;
let searchTerm = "";

const roleOf = (data = {}) => String(data.role || data.rol || "").trim().toLowerCase();
const activeOf = (data = {}) => data.activ !== false && data.active !== false && data.enabled !== false;
const nameOf = (data = {}) => String(data.nume || data.name || data.displayName || data.email || "Fără nume").trim();
const emailOf = (data = {}) => String(data.email || "Fără email").trim();

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function initials(value) {
  return String(value || "U").trim().split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase() || "").join("") || "U";
}

function setAccountStatus(active) {
  const el = document.getElementById(STATUS_ID);
  if (!el) return;
  el.textContent = active ? "Activ" : "Inactiv";
  el.dataset.active = active ? "true" : "false";
  el.style.color = active ? "var(--mint)" : "var(--danger)";
}

function toast(message, type = "success") {
  let host = document.getElementById("um-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "um-toast-host";
    host.innerHTML = `<style>
      #um-toast-host{position:fixed;right:20px;bottom:20px;z-index:20000;display:grid;gap:10px;width:min(380px,calc(100vw - 30px))}
      .um-toast{padding:13px 15px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:linear-gradient(145deg,rgba(27,35,53,.98),rgba(9,14,25,.98));box-shadow:0 24px 55px rgba(0,0,0,.45);color:var(--text);font-size:.78rem;opacity:0;transform:translateY(10px);transition:.2s ease}
      .um-toast.show{opacity:1;transform:none}.um-toast.error{border-color:rgba(255,105,97,.28)}.um-toast.warning{border-color:rgba(255,214,10,.28)}
    </style>`;
    document.body.appendChild(host);
  }
  const item = document.createElement("div");
  item.className = `um-toast ${type}`;
  item.textContent = message;
  host.appendChild(item);
  requestAnimationFrame(() => item.classList.add("show"));
  setTimeout(() => { item.classList.remove("show"); setTimeout(() => item.remove(), 220); }, 4000);
}

function modalConfirm(title, message, confirmLabel = "Confirmă", danger = true) {
  return new Promise(resolve => {
    let overlay = document.getElementById("um-confirm-v2");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "um-confirm-v2";
      overlay.innerHTML = `<style>
        #um-confirm-v2{position:fixed;inset:0;z-index:19000;display:none;place-items:center;padding:18px;background:rgba(2,5,12,.76);backdrop-filter:blur(15px)}
        #um-confirm-v2.show{display:grid}.um-cbox{width:min(430px,100%);padding:23px;border:1px solid rgba(255,255,255,.13);border-radius:24px;background:linear-gradient(150deg,rgba(27,35,53,.99),rgba(8,13,24,.99));box-shadow:0 35px 90px rgba(0,0,0,.6)}
        .um-ctitle{font-size:1.05rem;font-weight:750;color:var(--text)}.um-cmsg{margin-top:8px;color:var(--muted);font-size:.82rem;line-height:1.55}.um-cactions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}
        .um-cancel,.um-cok{min-height:40px;padding:0 14px;border-radius:12px;font:inherit;font-size:.74rem;font-weight:750;cursor:pointer}.um-cancel{color:var(--text);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09)}.um-cok{color:#081017;background:var(--mint);border:1px solid rgba(99,230,190,.3)}.um-cok.danger{color:#fff;background:linear-gradient(135deg,#ff6961,#e6495b);border-color:rgba(255,105,97,.35)}
      </style><div class="um-cbox"><div class="um-ctitle"></div><div class="um-cmsg"></div><div class="um-cactions"><button class="um-cancel" type="button">Anulează</button><button class="um-cok" type="button">Confirmă</button></div></div>`;
      document.body.appendChild(overlay);
    }
    overlay.querySelector(".um-ctitle").textContent = title;
    overlay.querySelector(".um-cmsg").textContent = message;
    const cancel = overlay.querySelector(".um-cancel");
    const ok = overlay.querySelector(".um-cok");
    ok.textContent = confirmLabel;
    ok.classList.toggle("danger", danger);
    const finish = value => { overlay.classList.remove("show"); resolve(value); };
    cancel.onclick = () => finish(false);
    ok.onclick = () => finish(true);
    overlay.onclick = e => { if (e.target === overlay) finish(false); };
    overlay.classList.add("show");
  });
}

function injectStyles() {
  if (document.getElementById("um-v2-style")) return;
  const style = document.createElement("style");
  style.id = "um-v2-style";
  style.textContent = `
    #um-v2{position:fixed;inset:0;z-index:16000;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(2,4,10,.78);backdrop-filter:blur(14px)}
    #um-v2.show{display:flex}.umv2-box{width:min(820px,100%);max-height:min(780px,calc(100vh - 32px));overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:26px;background:linear-gradient(180deg,rgba(12,21,37,.99),rgba(4,9,18,.99));box-shadow:0 40px 110px rgba(0,0,0,.56)}
    .umv2-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.07)}.umv2-title{font-size:1rem;font-weight:750;color:var(--text)}.umv2-sub{margin-top:4px;color:var(--text-3);font-size:.72rem}.umv2-close{width:38px;height:38px;border:1px solid rgba(255,255,255,.08);border-radius:11px;color:var(--text);background:rgba(255,255,255,.04);cursor:pointer;font-size:1.2rem}
    .umv2-body{display:grid;grid-template-columns:1.08fr .92fr;min-height:0}.umv2-list{padding:15px;border-right:1px solid rgba(255,255,255,.07);min-width:0}.umv2-search{width:100%;height:44px;padding:0 12px;border-radius:13px;border:1px solid rgba(255,255,255,.08);outline:none;background:rgba(255,255,255,.035);color:var(--text);font:inherit;font-size:.8rem}.umv2-count{margin:9px 1px;color:var(--text-3);font-size:.66rem;text-transform:uppercase;letter-spacing:.08em}.umv2-items{max-height:560px;overflow:auto}.umv2-row{width:100%;display:flex;align-items:center;gap:11px;margin-bottom:7px;padding:11px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.025);color:inherit;text-align:left;cursor:pointer}.umv2-row:hover,.umv2-row.selected{background:rgba(124,231,255,.055);border-color:rgba(124,231,255,.18)}.umv2-avatar{width:36px;height:36px;flex:0 0 36px;display:grid;place-items:center;border-radius:11px;color:var(--cyan);background:rgba(124,231,255,.06);border:1px solid rgba(124,231,255,.1);font-size:.75rem;font-weight:750}.umv2-main{flex:1;min-width:0}.umv2-name{display:block;color:var(--text);font-size:.8rem;font-weight:700;overflow-wrap:anywhere}.umv2-email{display:block;margin-top:2px;color:var(--text-3);font-size:.66rem;overflow-wrap:anywhere}.umv2-meta{display:grid;justify-items:end;gap:4px}.umv2-role{color:var(--cyan);font-size:.6rem;font-weight:750;text-transform:uppercase}.umv2-status{font-size:.59rem;font-weight:750;text-transform:uppercase;color:var(--mint)}.umv2-status.off{color:var(--danger)}
    .umv2-detail{padding:18px;min-width:0;overflow:auto}.umv2-empty{min-height:280px;display:grid;place-items:center;text-align:center;color:var(--text-3);font-size:.78rem;border:1px dashed rgba(255,255,255,.08);border-radius:17px;padding:20px}.umv2-label{display:block;margin-bottom:6px;color:var(--text-3);font-size:.61rem;font-weight:750;text-transform:uppercase;letter-spacing:.1em}.umv2-input,.umv2-select{width:100%;height:44px;margin-bottom:13px;padding:0 11px;border:1px solid rgba(255,255,255,.08);border-radius:12px;color:var(--text);background:rgba(3,7,14,.9);outline:none;font:inherit;font-size:.78rem}.umv2-save,.umv2-toggle{width:100%;height:44px;border-radius:12px;font:inherit;font-size:.74rem;font-weight:750;cursor:pointer}.umv2-save{margin-top:3px;border:1px solid rgba(124,231,255,.18);color:#fff;background:linear-gradient(110deg,rgba(76,141,255,.76),rgba(145,117,238,.7))}.umv2-toggle{margin-top:8px;border:1px solid rgba(255,105,97,.22);color:#ffdce2;background:rgba(255,105,97,.06)}.umv2-toggle.on{border-color:rgba(99,230,190,.24);color:#d3ffed;background:rgba(99,230,190,.07)}.umv2-note{margin:2px 0 12px;color:var(--text-3);font-size:.65rem;line-height:1.45}
    @media(max-width:760px){.umv2-body{grid-template-columns:1fr}.umv2-list{border-right:0;border-bottom:1px solid rgba(255,255,255,.07)}.umv2-items{max-height:260px}}
  `;
  document.head.appendChild(style);
}

function ensureModal() {
  let modal = document.getElementById("um-v2");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "um-v2";
  modal.innerHTML = `<div class="umv2-box" role="dialog" aria-modal="true"><div class="umv2-head"><div><div class="umv2-title">Gestionare utilizatori</div><div class="umv2-sub">Doar utilizatorii care au un role sunt afișați.</div></div><button type="button" class="umv2-close">×</button></div><div class="umv2-body"><div class="umv2-list"><input id="umv2-search" class="umv2-search" type="search" placeholder="Caută după nume, email sau role..."><div id="umv2-count" class="umv2-count"></div><div id="umv2-items" class="umv2-items"></div></div><div id="umv2-detail" class="umv2-detail"><div class="umv2-empty">Selectează un utilizator.</div></div></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector(".umv2-close").onclick = () => modal.classList.remove("show");
  modal.onclick = e => { if (e.target === modal) modal.classList.remove("show"); };
  document.addEventListener("keydown", e => { if (e.key === "Escape") modal.classList.remove("show"); });
  modal.querySelector("#umv2-search").oninput = e => { searchTerm = String(e.target.value || "").trim().toLowerCase(); renderUsers(); };
  return modal;
}

function renderUsers() {
  const list = document.getElementById("umv2-items");
  const count = document.getElementById("umv2-count");
  if (!list) return;
  const roleUsers = users.filter(u => ROLES.includes(roleOf(u)));
  const visible = roleUsers.filter(u => {
    if (!searchTerm) return true;
    const hay = [u.uid, emailOf(u), nameOf(u), roleOf(u)].join(" ").toLowerCase();
    return hay.includes(searchTerm);
  });
  if (count) count.textContent = `${visible.length} din ${roleUsers.length} utilizatori`;
  if (!visible.length) { list.innerHTML = `<div class="umv2-empty">Nu există utilizatori pentru această căutare.</div>`; return; }
  list.innerHTML = visible.map(u => {
    const active = activeOf(u);
    return `<button type="button" class="umv2-row ${selectedUid === u.uid ? "selected" : ""}" data-uid="${esc(u.uid)}"><span class="umv2-avatar">${esc(initials(nameOf(u)))}</span><span class="umv2-main"><span class="umv2-name">${esc(nameOf(u))}</span><span class="umv2-email">${esc(emailOf(u))}</span></span><span class="umv2-meta"><span class="umv2-role">${esc(roleOf(u))}</span><span class="umv2-status ${active ? "" : "off"}">${active ? "Activ" : "Inactiv"}</span></span></button>`;
  }).join("");
  list.querySelectorAll(".umv2-row").forEach(row => row.onclick = () => {
    selectedUid = row.dataset.uid || null;
    renderUsers();
    renderDetail();
  });
}

function renderDetail() {
  const detail = document.getElementById("umv2-detail");
  const user = users.find(u => u.uid === selectedUid);
  if (!detail) return;
  if (!user) { detail.innerHTML = `<div class="umv2-empty">Selectează un utilizator.</div>`; return; }
  const active = activeOf(user);
  const self = user.uid === currentUser?.uid;
  detail.innerHTML = `<label class="umv2-label">Nume</label><input id="umv2-name" class="umv2-input" value="${esc(nameOf(user))}"><label class="umv2-label">Role</label><select id="umv2-role" class="umv2-select" ${self ? "disabled" : ""}>${ROLES.map(r => `<option value="${r}" ${roleOf(user) === r ? "selected" : ""}>${r.toUpperCase()}</option>`).join("")}</select><label class="umv2-label">Stare cont</label><select id="umv2-active" class="umv2-select" ${self ? "disabled" : ""}><option value="true" ${active ? "selected" : ""}>ACTIV</option><option value="false" ${!active ? "selected" : ""}>INACTIV</option></select>${self ? `<div class="umv2-note">Contul conectat nu poate fi modificat din această zonă.</div>` : ""}<button type="button" class="umv2-save" id="umv2-save" ${self ? "disabled" : ""}>Salvează modificările</button><button type="button" class="umv2-toggle ${active ? "" : "on"}" id="umv2-toggle" ${self ? "disabled" : ""}>${active ? "Dezactivează contul" : "Reactivează contul"}</button>`;
  document.getElementById("umv2-save")?.addEventListener("click", saveUser);
  document.getElementById("umv2-toggle")?.addEventListener("click", toggleStatus);
}

async function canManage(target) {
  if (!currentUser || !target || target.uid === currentUser.uid) return false;
  const requester = currentUserData || {};
  const requesterRole = roleOf(requester);
  if (!["admin", "superadmin"].includes(requesterRole)) return false;
  const targetRole = roleOf(target);
  return !(targetRole === "superadmin" && requesterRole !== "superadmin");
}

async function saveUser() {
  const user = users.find(u => u.uid === selectedUid);
  if (!user || !(await canManage(user))) return toast("Nu ai permisiunea de a modifica acest cont.", "error");
  const name = String(document.getElementById("umv2-name")?.value || "").trim();
  const role = String(document.getElementById("umv2-role")?.value || roleOf(user)).trim().toLowerCase();
  const active = document.getElementById("umv2-active")?.value === "true";
  if (!name) return toast("Numele nu poate fi gol.", "error");
  if (!ROLES.includes(role)) return toast("Role invalid.", "error");
  try {
    await updateDoc(doc(db, "utilizatori", user.uid), { nume: name, role, rol: role, activ: active, active, enabled: active, updatedAt: serverTimestamp() });
    Object.assign(user, { nume: name, role, rol: role, activ: active, active, enabled: active });
    renderUsers(); renderDetail();
    toast(`Utilizatorul ${name} a fost actualizat.`);
  } catch (e) { console.error(e); toast(`Nu am putut salva: ${e.message || "eroare"}`, "error"); }
}

async function toggleStatus() {
  const user = users.find(u => u.uid === selectedUid);
  if (!user || !(await canManage(user))) return toast("Nu ai permisiunea de a modifica acest cont.", "error");
  const next = !activeOf(user);
  const name = nameOf(user);
  const ok = await modalConfirm(next ? "Reactivează contul" : "Dezactivează contul", next ? `Contul „${name}” va fi reactivat.` : `Contul „${name}” va fi trecut în starea INACTIV.`, next ? "Reactivează" : "Dezactivează", !next);
  if (!ok) return;
  try {
    await updateDoc(doc(db, "utilizatori", user.uid), { activ: next, active: next, enabled: next, updatedAt: serverTimestamp() });
    Object.assign(user, { activ: next, active: next, enabled: next });
    await addDoc(collection(db, "notificari"), { recipientId: currentUser.uid, title: next ? "Cont reactivat" : "Cont dezactivat", message: `${name} a fost ${next ? "reactivat" : "dezactivat"}.`, type: next ? "success" : "warning", read: false, createdAt: serverTimestamp(), source: "gestionare_utilizatori", requestId: "" });
    renderUsers(); renderDetail();
    toast(next ? `Contul „${name}” a fost reactivat.` : `Contul „${name}” a fost dezactivat.`);
  } catch (e) { console.error(e); toast(`Operațiunea a eșuat: ${e.message || "eroare"}`, "error"); }
}

async function loadUsers() {
  const snap = await getDocs(collection(db, "utilizatori"));
  users = snap.docs.map(d => ({ uid: d.id, ...(d.data() || {}) })).filter(u => ROLES.includes(roleOf(u)));
  users.sort((a, b) => nameOf(a).localeCompare(nameOf(b), "ro"));
  renderUsers();
}

async function init() {
  const card = document.getElementById(CARD_ID);
  if (!card) return;
  injectStyles();
  const modal = ensureModal();
  card.innerHTML = `<div class="card-head"><div class="card-title"><span class="card-index">04</span><div><h2>Gestionare utilizatori</h2><p>Administrează conturile cu role.</p></div></div><span class="card-note">Administrare</span></div><div class="actions-row" style="margin-top:0"><p class="action-copy">Caută și modifică utilizatorii într-un popup compact.</p><button type="button" id="umv2-open" class="btn-submit">Deschide utilizatori</button></div>`;
  document.getElementById("umv2-open").onclick = async () => { modal.classList.add("show"); await loadUsers(); document.getElementById("umv2-search")?.focus(); };

  onAuthStateChanged(auth, async user => {
    currentUser = user;
    if (!user) { card.style.display = "none"; return; }
    try {
      const snap = await getDoc(doc(db, "utilizatori", user.uid));
      currentUserData = snap.exists() ? snap.data() || {} : {};
      if (user.email === "tsplayer18@gmail.com" && !roleOf(currentUserData)) currentUserData.role = "superadmin";
      if (!["admin", "superadmin"].includes(roleOf(currentUserData))) { card.style.display = "none"; return; }
      setAccountStatus(activeOf(currentUserData));
      card.style.display = "block";
      await loadUsers();
    } catch (e) { console.error("Gestionare utilizatori:", e); card.style.display = "none"; }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
