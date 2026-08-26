import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ROLES = ["admin", "superadmin", "conducere", "isuls", "dsls", "mmls", "ssmls"];
let currentUser = null;
let currentUserData = null;
let users = [];
let initialized = false;

const roleOf = (data = {}) => String(data.role ?? data.rol ?? "").trim().toLowerCase();
const nameOf = (data = {}) => String(data.nume || data.name || data.displayName || data.email || "Fără nume").trim();
const emailOf = (data = {}) => String(data.email || "Fără email").trim();
const activeOf = (data = {}) => data.activ !== false && data.active !== false && data.enabled !== false;
const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
const initials = value => String(value || "U").trim().split(/\s+/).slice(0,2).map(x => x[0]?.toUpperCase() || "").join("") || "U";

function toast(message, type = "success") {
  let host = document.getElementById("um-null-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "um-null-toast-host";
    host.innerHTML = `<style>
      #um-null-toast-host{position:fixed;right:20px;bottom:20px;z-index:30000;display:grid;gap:9px;width:min(390px,calc(100vw - 30px))}
      .um-null-toast{padding:13px 15px;border:1px solid rgba(255,255,255,.12);border-radius:15px;background:linear-gradient(145deg,rgba(27,35,53,.98),rgba(8,13,24,.98));box-shadow:0 24px 55px rgba(0,0,0,.45);color:#f7f9ff;font-size:.78rem;font-weight:650;opacity:0;transform:translateY(10px);transition:.2s ease}.um-null-toast.show{opacity:1;transform:none}.um-null-toast.error{border-color:rgba(255,105,97,.32);color:#ffd8d6}.um-null-toast.warning{border-color:rgba(255,214,10,.28);color:#fff1af}
    </style>`;
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = `um-null-toast ${type}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 220); }, 3500);
}

function injectStyles() {
  if (document.getElementById("um-null-style")) return;
  const style = document.createElement("style");
  style.id = "um-null-style";
  style.textContent = `
    #um-null-modal{position:fixed;inset:0;z-index:28000;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(2,4,10,.78);backdrop-filter:blur(14px)}
    #um-null-modal.show{display:flex}.um-null-box{width:min(980px,100%);max-height:min(820px,calc(100vh - 32px));overflow:hidden;border:1px solid rgba(255,255,255,.13);border-radius:26px;background:linear-gradient(180deg,rgba(12,21,37,.99),rgba(4,9,18,.99));box-shadow:0 40px 110px rgba(0,0,0,.6)}
    .um-null-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.07)}.um-null-title{font-size:1rem;font-weight:800;color:#f7f9ff}.um-null-sub{margin-top:4px;color:#7f8aa0;font-size:.72rem}.um-null-close{width:38px;height:38px;border:1px solid rgba(255,255,255,.08);border-radius:11px;color:#fff;background:rgba(255,255,255,.04);cursor:pointer;font-size:1.1rem}
    .um-null-body{display:grid;grid-template-columns:1fr 1.12fr;min-height:0}.um-null-list{padding:15px;border-right:1px solid rgba(255,255,255,.07);min-width:0}.um-null-search{width:100%;height:44px;padding:0 12px;border-radius:13px;border:1px solid rgba(255,255,255,.08);outline:none;background:rgba(255,255,255,.035);color:#f7f9ff;font:inherit;font-size:.8rem}.um-null-count{margin:9px 1px;color:#7f8aa0;font-size:.66rem;text-transform:uppercase;letter-spacing:.08em}.um-null-items{max-height:620px;overflow:auto}.um-null-row{width:100%;display:flex;align-items:center;gap:11px;margin-bottom:7px;padding:11px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.025);color:inherit;text-align:left;cursor:pointer}.um-null-row:hover,.um-null-row.selected{background:rgba(124,231,255,.055);border-color:rgba(124,231,255,.18)}.um-null-avatar{width:36px;height:36px;flex:0 0 36px;display:grid;place-items:center;border-radius:11px;color:#9ee9ff;background:rgba(124,231,255,.06);border:1px solid rgba(124,231,255,.1);font-size:.75rem;font-weight:750}.um-null-main{flex:1;min-width:0}.um-null-name{display:block;color:#f7f9ff;font-size:.8rem;font-weight:700;overflow-wrap:anywhere}.um-null-email{display:block;margin-top:2px;color:#7f8aa0;font-size:.66rem;overflow-wrap:anywhere}.um-null-meta{display:grid;justify-items:end;gap:4px}.um-null-role{color:#9ee9ff;font-size:.6rem;font-weight:750;text-transform:uppercase}.um-null-role.none{color:#ffd60a}.um-null-status{font-size:.59rem;font-weight:750;text-transform:uppercase;color:#63e6be}.um-null-status.off{color:#ff6961}
    .um-null-detail{padding:18px;min-width:0;overflow:auto}.um-null-empty{min-height:280px;display:grid;place-items:center;text-align:center;color:#7f8aa0;font-size:.78rem;border:1px dashed rgba(255,255,255,.08);border-radius:17px;padding:20px}.um-null-profile{display:grid;grid-template-columns:56px minmax(0,1fr);gap:12px;align-items:center;padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(255,255,255,.025);margin-bottom:14px}.um-null-profile-avatar{width:56px;height:56px;border-radius:16px;display:grid;place-items:center;font-weight:850;font-size:1rem;color:#dff8ff;background:linear-gradient(145deg,rgba(10,132,255,.28),rgba(191,90,242,.2));border:1px solid rgba(100,210,255,.18)}.um-null-profile-name{font-size:1rem;font-weight:800;color:#f7f9ff}.um-null-profile-email{margin-top:3px;font-size:.7rem;color:#7f8aa0;overflow-wrap:anywhere}.um-null-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.um-null-badge{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border-radius:999px;font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.um-null-badge.role{color:#cfefff;background:rgba(100,210,255,.08);border:1px solid rgba(100,210,255,.13)}.um-null-badge.none{color:#fff0b0;background:rgba(255,214,10,.08);border:1px solid rgba(255,214,10,.16)}.um-null-badge.active{color:#caffec;background:rgba(99,230,190,.08);border:1px solid rgba(99,230,190,.12)}
    .um-null-label{display:block;margin:15px 0 6px;color:#7f8aa0;font-size:.61rem;font-weight:750;text-transform:uppercase;letter-spacing:.1em}.um-null-select{width:100%;height:44px;padding:0 11px;border:1px solid rgba(255,255,255,.08);border-radius:12px;color:#f7f9ff;background:rgba(3,7,14,.9);outline:none;font:inherit;font-size:.78rem}.um-null-note{margin-top:8px;color:#7f8aa0;font-size:.66rem;line-height:1.5}.um-null-actions{display:flex;gap:8px;margin-top:14px}.um-null-save{flex:1;height:44px;border-radius:12px;border:1px solid rgba(124,231,255,.18);color:#fff;background:linear-gradient(110deg,rgba(76,141,255,.76),rgba(145,117,238,.7));font:inherit;font-size:.74rem;font-weight:750;cursor:pointer}.um-null-noaccess{color:#fff;background:linear-gradient(135deg,#7a5c00,#b99000)!important;border-color:rgba(255,214,10,.35)!important}.um-null-disabled{opacity:.52;cursor:not-allowed}.um-null-warning{margin-top:12px;padding:11px 12px;border:1px solid rgba(255,214,10,.18);border-radius:13px;color:#fff1af;background:rgba(255,214,10,.055);font-size:.68rem;line-height:1.45}
    @media(max-width:760px){.um-null-body{grid-template-columns:1fr}.um-null-list{border-right:0;border-bottom:1px solid rgba(255,255,255,.07)}.um-null-items{max-height:260px}}
  `;
  document.head.appendChild(style);
}

function isAdmin(data = {}) {
  return ["admin", "superadmin"].includes(roleOf(data));
}

async function loadUsers() {
  const snap = await getDocs(collection(db, "utilizatori"));
  users = snap.docs.map(d => ({ uid:d.id, ...(d.data() || {}) }));
  users.sort((a,b) => nameOf(a).localeCompare(nameOf(b), "ro"));
  renderUserList();
}

function renderUserList() {
  const list = document.getElementById("um-null-items");
  const count = document.getElementById("um-null-count");
  if (!list || !count) return;
  const term = String(document.getElementById("um-null-search")?.value || "").trim().toLowerCase();
  const filtered = users.filter(u => !term || `${nameOf(u)} ${emailOf(u)} ${roleOf(u)} ${u.uid}`.toLowerCase().includes(term));
  count.textContent = `${filtered.length} utilizatori`;
  list.innerHTML = filtered.map(user => {
    const role = roleOf(user);
    const none = !role;
    return `<button class="um-null-row ${user.uid === window.__umNullSelectedUid ? "selected" : ""}" type="button" data-um-null-user="${esc(user.uid)}">
      <span class="um-null-avatar">${esc(initials(nameOf(user)))}</span><span class="um-null-main"><span class="um-null-name">${esc(nameOf(user))}</span><span class="um-null-email">${esc(emailOf(user))}</span></span>
      <span class="um-null-meta"><span class="um-null-role ${none ? "none" : ""}">${none ? "FĂRĂ ROLE" : esc(role.toUpperCase())}</span><span class="um-null-status ${activeOf(user) ? "" : "off"}">${activeOf(user) ? "ACTIV" : "INACTIV"}</span></span>
    </button>`;
  }).join("") || `<div style="padding:25px;text-align:center;color:#7f8aa0;font-size:.76rem">Nu există utilizatori pentru căutarea selectată.</div>`;
  list.querySelectorAll("[data-um-null-user]").forEach(btn => btn.addEventListener("click", () => selectUser(btn.dataset.umNullUser)));
}

function roleOptions(selected) {
  const options = [{ value:"", label:"FĂRĂ ROLE — fără acces" }, ...ROLES.map(r => ({ value:r, label:r.toUpperCase() }))];
  return options.map(o => `<option value="${esc(o.value)}" ${o.value === selected ? "selected" : ""}>${esc(o.label)}</option>`).join("");
}

function selectUser(uid) {
  const user = users.find(u => u.uid === uid);
  if (!user) return;
  window.__umNullSelectedUid = uid;
  renderUserList();
  const detail = document.getElementById("um-null-detail");
  if (!detail) return;
  const role = roleOf(user);
  const self = currentUser?.uid === user.uid;
  const none = !role;
  const protectedSelf = self;
  const canEdit = isAdmin(currentUserData) && !protectedSelf && !(role === "superadmin" && roleOf(currentUserData) !== "superadmin");

  detail.innerHTML = `<div class="um-null-profile"><div class="um-null-profile-avatar">${esc(initials(nameOf(user)))}</div><div><div class="um-null-profile-name">${esc(nameOf(user))}</div><div class="um-null-profile-email">${esc(emailOf(user))}</div><div class="um-null-badges"><span class="um-null-badge ${none ? "none" : "role"}">${none ? "FĂRĂ ROLE" : esc(role.toUpperCase())}</span><span class="um-null-badge ${activeOf(user) ? "active" : ""}">${activeOf(user) ? "ACTIV" : "INACTIV"}</span></div></div></div>
  <div style="font-size:.65rem;color:#7f8aa0;line-height:1.5">UID: <span style="color:#eef5ff;word-break:break-all">${esc(user.uid)}</span></div>
  <label class="um-null-label">Role</label><select id="um-null-role" class="um-null-select" ${canEdit ? "" : "disabled"}>${roleOptions(role)}</select>
  <div class="um-null-note">Alege „FĂRĂ ROLE” pentru a elimina toate accesele administrative/de departament. Contul poate rămâne activ pentru autentificare normală.</div>
  ${none ? `<div class="um-null-warning">Acest utilizator nu are niciun role setat și nu ar trebui să primească acces la zonele administrative.</div>` : ""}
  <div class="um-null-actions"><button type="button" id="um-null-save" class="um-null-save ${none ? "um-null-noaccess" : ""} ${canEdit ? "" : "um-null-disabled"}" ${canEdit ? "" : "disabled"}>Salvează role</button></div>
  ${protectedSelf ? `<div class="um-null-note">Nu poți modifica propriul cont din această zonă.</div>` : ""}`;

  document.getElementById("um-null-save")?.addEventListener("click", () => saveRole(user));
}

async function saveRole(user) {
  if (!isAdmin(currentUserData) || user.uid === currentUser?.uid) {
    toast("Nu ai permisiunea de a modifica acest utilizator.", "error");
    return;
  }
  const targetRole = String(document.getElementById("um-null-role")?.value || "").trim().toLowerCase();
  const oldRole = roleOf(user);
  if (targetRole && !ROLES.includes(targetRole)) {
    toast("Role invalid.", "error");
    return;
  }
  if (oldRole === "superadmin" && roleOf(currentUserData) !== "superadmin") {
    toast("Doar un superadmin poate modifica un superadmin.", "error");
    return;
  }
  try {
    await updateDoc(doc(db, "utilizatori", user.uid), {
      role: targetRole || null,
      rol: targetRole || null,
      updatedAt: serverTimestamp()
    });
    user.role = targetRole || null;
    user.rol = targetRole || null;
    renderUserList();
    selectUser(user.uid);
    toast(targetRole ? `Role-ul lui ${nameOf(user)} a fost setat pe ${targetRole.toUpperCase()}.` : `Toate accesările administrative ale lui ${nameOf(user)} au fost eliminate.`);
  } catch (error) {
    console.error("Role update:", error);
    toast(`Nu am putut salva role-ul: ${error.message || "eroare"}`, "error");
  }
}

function ensureModal() {
  injectStyles();
  let modal = document.getElementById("um-null-modal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "um-null-modal";
  modal.innerHTML = `<div class="um-null-box"><div class="um-null-head"><div><div class="um-null-title">Gestionare utilizatori</div><div class="um-null-sub">Role-uri și accesuri</div></div><button class="um-null-close" type="button" aria-label="Închide">×</button></div><div class="um-null-body"><div class="um-null-list"><input id="um-null-search" class="um-null-search" type="search" placeholder="Caută utilizator..."><div id="um-null-count" class="um-null-count"></div><div id="um-null-items" class="um-null-items"></div></div><div id="um-null-detail" class="um-null-detail"><div class="um-null-empty">Selectează un utilizator pentru a-i gestiona role-ul.<br><br><b>FĂRĂ ROLE</b> înseamnă fără acces administrativ.</div></div></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector(".um-null-close").addEventListener("click", () => modal.classList.remove("show"));
  modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("show"); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") modal.classList.remove("show"); });
  document.getElementById("um-null-search")?.addEventListener("input", renderUserList);
  return modal;
}

function openModal() {
  const modal = ensureModal();
  modal.classList.add("show");
  loadUsers().catch(error => { console.error(error); toast(`Nu am putut încărca utilizatorii: ${error.message || "eroare"}`, "error"); });
}

function hookOpenButton() {
  const button = document.getElementById("umv2-open");
  if (!button || button.__umNullHooked) return Boolean(button);
  button.__umNullHooked = true;
  document.addEventListener("click", event => {
    const target = event.target.closest?.("#umv2-open");
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openModal();
  }, true);
  return true;
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, "utilizatori", user.uid));
    currentUserData = snap.exists() ? snap.data() || {} : {};
    if (user.email === "tsplayer18@gmail.com" && !roleOf(currentUserData)) currentUserData.role = "superadmin";
  } catch (error) {
    console.error("Role management auth:", error);
    currentUserData = {};
  }
  if (!isAdmin(currentUserData)) return;
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (hookOpenButton() || attempts >= 50) clearInterval(timer);
  }, 100);
});
