const CARD_ID = "userManagementCard";
const ROLES = ["admin", "superadmin", "conducere", "isuls", "dsls", "mmls", "ssmls"];

let sessionUser = null;
let users = [];
let selectedUid = null;
let searchTerm = "";

const roleOf = (u = {}) => String(u.role ?? u.rol ?? "").trim().toLowerCase();
const nameOf = (u = {}) => String(u.nume || u.name || u.displayName || u.username || u.email || "Fără nume").trim();
const emailOf = (u = {}) => String(u.email || "Fără email").trim();
const discordOf = (u = {}) => String(u.discordId || u.discord_id || u.discordUid || u.discordUID || "—").trim() || "—";
const activeOf = (u = {}) => u.activ !== false && u.active !== false && u.enabled !== false;
const formatDate = value => { if (!value) return "—"; const d = value?.toDate ? value.toDate() : new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ro-RO", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); };
const initials = value => String(value || "U").trim().split(/\s+/).slice(0,2).map(x => x[0]?.toUpperCase() || "").join("") || "U";
const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[c]));

function toast(message, type = "success") {
  let host = document.getElementById("pcls-user-mgmt-toast");
  if (!host) { host = document.createElement("div"); host.id = "pcls-user-mgmt-toast"; document.body.appendChild(host); }
  const item = document.createElement("div"); item.className = `pcls-umt ${type}`; item.textContent = message; host.appendChild(item);
  requestAnimationFrame(() => item.classList.add("show"));
  setTimeout(() => { item.classList.remove("show"); setTimeout(() => item.remove(), 220); }, 3500);
}

function ensureStyles() {
  if (document.getElementById("pcls-user-mgmt-style")) return;
  const style = document.createElement("style");
  style.id = "pcls-user-mgmt-style";
  style.textContent = `
#pcls-user-mgmt-toast{position:fixed;right:20px;bottom:20px;z-index:50000;display:grid;gap:8px;width:min(390px,calc(100vw - 30px))}.pcls-umt{padding:13px 15px;border-radius:15px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(145deg,rgba(27,35,53,.98),rgba(8,13,24,.98));box-shadow:0 24px 55px rgba(0,0,0,.45);color:#f7f9ff;font-size:.78rem;opacity:0;transform:translateY(10px);transition:.2s}.pcls-umt.show{opacity:1;transform:none}.pcls-umt.error{border-color:rgba(255,105,97,.3);color:#ffd8d6}
#pcls-user-mgmt-modal{position:fixed;inset:0;z-index:40000;display:none;place-items:center;padding:16px;background:rgba(2,4,10,.8);backdrop-filter:blur(16px)}#pcls-user-mgmt-modal.show{display:grid}.pcls-umm-box{width:min(1120px,100%);max-height:min(860px,calc(100vh - 32px));overflow:hidden;border:1px solid rgba(255,255,255,.13);border-radius:28px;background:linear-gradient(180deg,rgba(12,21,37,.99),rgba(4,9,18,.99));box-shadow:0 40px 120px rgba(0,0,0,.62)}.pcls-umm-head{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid rgba(255,255,255,.07)}.pcls-umm-title{font-size:1.05rem;font-weight:800}.pcls-umm-sub{margin-top:4px;color:#7f8aa0;font-size:.72rem}.pcls-umm-close{width:38px;height:38px;border:1px solid rgba(255,255,255,.08);border-radius:12px;color:#fff;background:rgba(255,255,255,.04);cursor:pointer;font-size:1.2rem}.pcls-umm-body{display:grid;grid-template-columns:360px 1fr;min-height:0;height:min(730px,calc(100vh - 120px))}.pcls-umm-list{padding:15px;border-right:1px solid rgba(255,255,255,.07);min-width:0;overflow:hidden}.pcls-umm-search{width:100%;height:44px;padding:0 13px;border-radius:13px;border:1px solid rgba(255,255,255,.08);outline:none;background:rgba(255,255,255,.035);color:#fff;font:inherit;font-size:.8rem}.pcls-umm-count{margin:9px 1px;color:#7f8aa0;font-size:.64rem;text-transform:uppercase;letter-spacing:.08em}.pcls-umm-items{height:calc(100% - 75px);overflow:auto;padding-right:3px}.pcls-umm-row{width:100%;display:flex;align-items:center;gap:10px;margin-bottom:7px;padding:11px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.025);color:#fff;text-align:left;cursor:pointer}.pcls-umm-row:hover,.pcls-umm-row.selected{background:rgba(124,231,255,.055);border-color:rgba(124,231,255,.2)}.pcls-umm-avatar{width:38px;height:38px;flex:0 0 38px;display:grid;place-items:center;border-radius:11px;color:#b9efff;background:rgba(124,231,255,.07);border:1px solid rgba(124,231,255,.12);font-size:.72rem;font-weight:800}.pcls-umm-main{min-width:0;flex:1}.pcls-umm-name{display:block;font-size:.78rem;font-weight:750;overflow-wrap:anywhere}.pcls-umm-email{display:block;margin-top:2px;color:#78869d;font-size:.63rem;overflow-wrap:anywhere}.pcls-umm-meta{display:grid;justify-items:end;gap:3px}.pcls-umm-role{color:#9ee9ff;font-size:.57rem;font-weight:800;text-transform:uppercase}.pcls-umm-role.none{color:#ffd60a}.pcls-umm-status{color:#68f2c0;font-size:.56rem;font-weight:800;text-transform:uppercase}.pcls-umm-status.off{color:#ff7185}.pcls-umm-detail{padding:18px;overflow:auto;min-width:0}.pcls-umm-empty{min-height:280px;display:grid;place-items:center;text-align:center;color:#78869d;border:1px dashed rgba(255,255,255,.08);border-radius:18px;padding:20px;font-size:.78rem}.pcls-umm-profile{display:grid;grid-template-columns:58px minmax(0,1fr);gap:12px;align-items:center;padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(255,255,255,.025);margin-bottom:14px}.pcls-umm-profile-avatar{width:58px;height:58px;display:grid;place-items:center;border-radius:17px;color:#e4f9ff;background:linear-gradient(145deg,rgba(10,132,255,.28),rgba(167,124,255,.2));border:1px solid rgba(100,210,255,.18);font-weight:850}.pcls-umm-profile-name{font-size:1.02rem;font-weight:800}.pcls-umm-profile-email{margin-top:3px;color:#78869d;font-size:.7rem;overflow-wrap:anywhere}.pcls-umm-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.pcls-umm-badge{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border-radius:999px;font-size:.57rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.pcls-umm-badge.role{color:#cfefff;background:rgba(100,210,255,.08);border:1px solid rgba(100,210,255,.14)}.pcls-umm-badge.none{color:#fff0b0;background:rgba(255,214,10,.07);border:1px solid rgba(255,214,10,.16)}.pcls-umm-badge.active{color:#caffec;background:rgba(99,230,190,.08);border:1px solid rgba(99,230,190,.13)}.pcls-umm-badge.off{color:#ffd6d4;background:rgba(255,105,97,.08);border:1px solid rgba(255,105,97,.13)}.pcls-umm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}.pcls-umm-info{padding:10px 11px;border:1px solid rgba(255,255,255,.07);border-radius:13px;background:rgba(255,255,255,.02)}.pcls-umm-info small{display:block;color:#78869d;font-size:.55rem;text-transform:uppercase;letter-spacing:.08em}.pcls-umm-info strong{display:block;margin-top:4px;color:#eef5ff;font-size:.7rem;line-height:1.4;word-break:break-word}.pcls-umm-label{display:block;margin:14px 0 6px;color:#78869d;font-size:.61rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.pcls-umm-select{width:100%;height:44px;padding:0 11px;border:1px solid rgba(255,255,255,.08);border-radius:12px;color:#fff;background:rgba(3,7,14,.9);outline:none;font:inherit;font-size:.78rem}.pcls-umm-save{width:100%;height:44px;margin-top:13px;border:1px solid rgba(124,231,255,.18);border-radius:12px;color:#fff;background:linear-gradient(110deg,rgba(76,141,255,.78),rgba(145,117,238,.72));font:inherit;font-size:.74rem;font-weight:800;cursor:pointer}.pcls-umm-note{margin-top:10px;color:#78869d;font-size:.66rem;line-height:1.5}@media(max-width:780px){.pcls-umm-body{grid-template-columns:1fr;height:auto}.pcls-umm-list{border-right:0;border-bottom:1px solid rgba(255,255,255,.07)}.pcls-umm-items{height:240px}.pcls-umm-grid{grid-template-columns:1fr}}
`;
  document.head.appendChild(style);
}

async function getSession() {
  try {
    const response = await fetch("/api/me", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => ({}));
    return response.ok && data.ok && data.user ? data.user : null;
  } catch (_) { return null; }
}

function isManager(role) {
  return ["admin", "superadmin"].includes(String(role || "").trim().toLowerCase());
}

function roleOptions(selected) {
  return [`<option value="" ${selected ? "" : "selected"}>FĂRĂ ROLE — fără acces</option>`, ...ROLES.map(role => `<option value="${role}" ${selected === role ? "selected" : ""}>${role.toUpperCase()}</option>`)].join("");
}

async function loadUsers() {
  const response = await fetch("/api/user-management", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "Nu s-au putut încărca utilizatorii.");
  users = Array.isArray(data.users) ? data.users : [];
  renderList();
  if (!selectedUid && users[0]) selectUser(users[0].uid);
  else if (selectedUid) selectUser(selectedUid);
}

function renderList() {
  const list = document.getElementById("pcls-umm-items");
  const count = document.getElementById("pcls-umm-count");
  if (!list) return;
  const visible = users.filter(user => {
    if (!searchTerm) return true;
    return [user.uid, nameOf(user), emailOf(user), roleOf(user), discordOf(user), user.departament, user.department].join(" ").toLowerCase().includes(searchTerm);
  });
  if (count) count.textContent = `${visible.length} din ${users.length} utilizatori`;
  list.innerHTML = visible.map(user => {
    const role = roleOf(user);
    return `<button type="button" class="pcls-umm-row ${selectedUid === user.uid ? "selected" : ""}" data-uid="${esc(user.uid)}"><span class="pcls-umm-avatar">${esc(initials(nameOf(user)))}</span><span class="pcls-umm-main"><span class="pcls-umm-name">${esc(nameOf(user))}</span><span class="pcls-umm-email">${esc(emailOf(user))}</span></span><span class="pcls-umm-meta"><span class="pcls-umm-role ${role ? "" : "none"}">${role ? esc(role.toUpperCase()) : "FĂRĂ ROLE"}</span><span class="pcls-umm-status ${activeOf(user) ? "" : "off"}">${activeOf(user) ? "ACTIV" : "INACTIV"}</span></span></button>`;
  }).join("") || `<div class="pcls-umm-empty">Nu există utilizatori pentru căutarea curentă.</div>`;
  list.querySelectorAll("[data-uid]").forEach(btn => btn.onclick = () => selectUser(btn.dataset.uid));
}

function selectUser(uid) {
  const user = users.find(item => item.uid === uid);
  if (!user) return;
  selectedUid = uid;
  renderList();
  const detail = document.getElementById("pcls-umm-detail");
  if (!detail) return;
  const role = roleOf(user);
  const self = String(sessionUser?.uid || "") === String(user.uid);
  const canEdit = isManager(sessionUser?.role) && !self && !(role === "superadmin" && sessionUser?.role !== "superadmin");
  const info = [
    ["UID", user.uid],
    ["Discord ID", discordOf(user)],
    ["Departament", user.departament || user.department || user.dept || "—"],
    ["Cont creat", formatDate(user.createdAt || user.created_at || user.dataCreare)],
    ["Ultima autentificare", formatDate(user.lastLogin || user.last_login || user.ultimaLogare)],
    ["Status", activeOf(user) ? "Activ" : "Inactiv"],
    ["Rol", role || "FĂRĂ ROLE"],
    ["Username Discord", user.username || user.numeDiscord || "—"]
  ];
  detail.innerHTML = `<div class="pcls-umm-profile"><div class="pcls-umm-profile-avatar">${esc(initials(nameOf(user)))}</div><div><div class="pcls-umm-profile-name">${esc(nameOf(user))}</div><div class="pcls-umm-profile-email">${esc(emailOf(user))}</div><div class="pcls-umm-badges"><span class="pcls-umm-badge ${role ? "role" : "none"}">${role ? esc(role.toUpperCase()) : "FĂRĂ ROLE"}</span><span class="pcls-umm-badge ${activeOf(user) ? "active" : "off"}">${activeOf(user) ? "ACTIV" : "INACTIV"}</span></div></div></div><div class="pcls-umm-grid">${info.map(([label,value]) => `<div class="pcls-umm-info"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join("")}</div><label class="pcls-umm-label">Role</label><select id="pcls-umm-role" class="pcls-umm-select" ${canEdit ? "" : "disabled"}>${roleOptions(role)}</select>${self ? `<div class="pcls-umm-note">Nu îți poți modifica propriul rol din Gestiune utilizatori.</div>` : ""}${role === "superadmin" && sessionUser?.role !== "superadmin" ? `<div class="pcls-umm-note">Doar un superadmin poate modifica acest cont.</div>` : ""}<button type="button" id="pcls-umm-save" class="pcls-umm-save" ${canEdit ? "" : "disabled"}>Salvează modificările</button>`;
  document.getElementById("pcls-umm-save")?.addEventListener("click", saveRole);
}

async function saveRole() {
  const user = users.find(item => item.uid === selectedUid);
  if (!user) return;
  const role = String(document.getElementById("pcls-umm-role")?.value || "").trim().toLowerCase();
  try {
    const response = await fetch("/api/user-management", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ uid: user.uid, role: role || null })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "Nu s-a putut salva rolul.");
    user.role = data.role;
    user.rol = data.role;
    renderList();
    selectUser(user.uid);
    toast(`Rolul utilizatorului ${nameOf(user)} a fost actualizat.`);
  } catch (error) {
    toast(error.message || "Eroare la salvare.", "error");
  }
}

function ensureModal() {
  let modal = document.getElementById("pcls-user-mgmt-modal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "pcls-user-mgmt-modal";
  modal.innerHTML = `<div class="pcls-umm-box" role="dialog" aria-modal="true" aria-labelledby="pcls-umm-title"><div class="pcls-umm-head"><div><div class="pcls-umm-title" id="pcls-umm-title">Gestionare utilizatori</div><div class="pcls-umm-sub">Toate conturile create în portal · inclusiv utilizatorii fără role</div></div><button type="button" class="pcls-umm-close" aria-label="Închide">×</button></div><div class="pcls-umm-body"><div class="pcls-umm-list"><input id="pcls-umm-search" class="pcls-umm-search" placeholder="Caută nume, email, Discord ID, UID, role..."><div id="pcls-umm-count" class="pcls-umm-count"></div><div id="pcls-umm-items" class="pcls-umm-items"></div></div><div id="pcls-umm-detail" class="pcls-umm-detail"><div class="pcls-umm-empty">Selectează un utilizator.</div></div></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector(".pcls-umm-close").onclick = () => modal.classList.remove("show");
  modal.onclick = event => { if (event.target === modal) modal.classList.remove("show"); };
  modal.querySelector("#pcls-umm-search").oninput = event => { searchTerm = String(event.target.value || "").trim().toLowerCase(); renderList(); };
  document.addEventListener("keydown", event => { if (event.key === "Escape") modal.classList.remove("show"); }, { passive: true });
  return modal;
}

async function openManager() {
  const modal = ensureModal();
  modal.classList.add("show");
  try {
    await loadUsers();
    document.getElementById("pcls-umm-search")?.focus();
  } catch (error) {
    toast(error.message || "Nu s-au putut încărca utilizatorii.", "error");
  }
}

async function init() {
  const card = document.getElementById(CARD_ID);
  if (!card || card.dataset.pclsUserManagementReady === "1") return;
  card.dataset.pclsUserManagementReady = "1";
  ensureStyles();
  sessionUser = await getSession();
  if (!isManager(sessionUser?.role)) {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";
  card.innerHTML = `<div class="card-head"><div class="card-title"><span class="card-index">04</span><div><h2>Gestionare utilizatori</h2><p>Administrează toate conturile create în portal.</p></div></div><span class="card-note">Administrare</span></div><div class="actions-row" style="margin-top:0"><p class="action-copy">Vezi fiecare utilizator, toate datele disponibile și modifică rolul. „Fără role” elimină accesul administrativ.</p><button type="button" id="pcls-open-user-management" class="btn-submit">Deschide utilizatori</button></div>`;
  document.getElementById("pcls-open-user-management")?.addEventListener("click", openManager);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();