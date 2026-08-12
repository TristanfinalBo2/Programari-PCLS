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

const CARD_ID = "userManagementCard";
const STATUS_ID = "userStatus";

const ALLOWED_ROLES = [
  "admin",
  "superadmin",
  "conducere",
  "isuls",
  "dsls",
  "mmls",
  "ssmls"
];

let users = [];
let currentUid = null;
let currentUserData = null;
let selectedUserUid = null;
let modalSearchTerm = "";

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function isUserActive(data = {}) {
  return data.activ !== false && data.active !== false && data.enabled !== false;
}

function updateCurrentUserStatus(active) {
  const statusElement = document.getElementById(STATUS_ID);
  if (!statusElement) return;

  statusElement.textContent = active ? "Activ" : "Inactiv";
  statusElement.style.color = active ? "var(--mint)" : "var(--danger)";
  statusElement.dataset.active = active ? "true" : "false";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getCard() {
  return document.getElementById(CARD_ID);
}

function showMessage(message, success = true) {
  const box = document.getElementById("statusMessage");
  if (!box) return;

  box.textContent = message;
  box.className = `alert-box ${success ? "alert-success" : "alert-error"}`;
  box.style.display = "block";

  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => {
    box.style.display = "none";
  }, 6000);
}

function injectModalStyles() {
  if (document.getElementById("user-management-modal-styles")) return;

  const style = document.createElement("style");
  style.id = "user-management-modal-styles";
  style.textContent = `
    #user-management-modal {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(2, 4, 10, .78);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    #user-management-modal.show { display: flex; }

    .um-modal-box {
      width: min(760px, 100%);
      max-height: min(760px, calc(100vh - 40px));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 28px;
      border: 1px solid rgba(255,255,255,.11);
      background:
        radial-gradient(circle at 10% 0%, rgba(124,231,255,.06), transparent 30%),
        radial-gradient(circle at 95% 0%, rgba(167,124,255,.055), transparent 28%),
        linear-gradient(180deg, rgba(12,21,37,.99), rgba(4,9,18,.99));
      box-shadow: 0 40px 110px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.045);
    }

    .um-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 20px 22px 16px;
      border-bottom: 1px solid rgba(255,255,255,.065);
    }

    .um-modal-title {
      color: var(--text);
      font-size: 1rem;
      font-weight: 650;
    }

    .um-modal-subtitle {
      margin-top: 4px;
      color: var(--text-3);
      font-size: .76rem;
    }

    .um-modal-close {
      width: 38px;
      height: 38px;
      flex: 0 0 38px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 12px;
      color: var(--text-2);
      background: rgba(255,255,255,.04);
      font: inherit;
      font-size: 1.25rem;
      cursor: pointer;
    }

    .um-modal-close:hover {
      color: #fff;
      background: rgba(255,255,255,.08);
    }

    .um-modal-body {
      min-height: 0;
      display: grid;
      grid-template-columns: 1.15fr .85fr;
    }

    .um-list-pane {
      min-width: 0;
      padding: 16px;
      border-right: 1px solid rgba(255,255,255,.065);
    }

    .um-search-shell {
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 46px;
      padding: 0 13px;
      border-radius: 14px;
      background: rgba(255,255,255,.035);
      border: 1px solid rgba(255,255,255,.08);
    }

    .um-search-icon {
      color: var(--cyan);
      font-size: .95rem;
    }

    .um-search-input {
      width: 100%;
      border: 0;
      outline: 0;
      color: var(--text);
      background: transparent;
      font: inherit;
      font-size: .82rem;
    }

    .um-search-input::placeholder { color: var(--text-3); }

    .um-list-count {
      margin: 10px 2px 8px;
      color: var(--text-3);
      font-size: .68rem;
      text-transform: uppercase;
      letter-spacing: .1em;
    }

    .um-user-list {
      max-height: 500px;
      overflow-y: auto;
      padding-right: 3px;
      scrollbar-width: thin;
    }

    .um-user-list::-webkit-scrollbar { width: 7px; }
    .um-user-list::-webkit-scrollbar-track { background: transparent; }
    .um-user-list::-webkit-scrollbar-thumb { background: rgba(124,231,255,.2); border-radius: 999px; }

    .um-user-row {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
      padding: 12px;
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 15px;
      color: inherit;
      background: rgba(255,255,255,.025);
      text-align: left;
      cursor: pointer;
      transition: background var(--ease), border-color var(--ease), transform var(--ease);
    }

    .um-user-row:hover,
    .um-user-row.selected {
      background: rgba(124,231,255,.055);
      border-color: rgba(124,231,255,.16);
      transform: translateY(-1px);
    }

    .um-user-avatar {
      width: 36px;
      height: 36px;
      flex: 0 0 36px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      color: var(--cyan);
      background: rgba(124,231,255,.06);
      border: 1px solid rgba(124,231,255,.11);
      font-size: .78rem;
      font-weight: 700;
    }

    .um-user-main { min-width: 0; flex: 1; }
    .um-user-name { color: var(--text); font-size: .82rem; font-weight: 650; overflow-wrap: anywhere; }
    .um-user-email { margin-top: 3px; color: var(--text-3); font-size: .68rem; overflow-wrap: anywhere; }

    .um-user-meta {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 5px;
    }

    .um-role {
      color: var(--cyan);
      font-size: .62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .um-active {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: #d3ffed;
      font-size: .6rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .um-active::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--mint);
      box-shadow: 0 0 9px rgba(104,242,192,.65);
    }

    .um-active.inactive { color: #ffd5dc; }
    .um-active.inactive::before { background: var(--danger); box-shadow: 0 0 9px rgba(255,113,133,.55); }

    .um-edit-pane {
      min-width: 0;
      padding: 18px;
    }

    .um-empty-detail {
      height: 100%;
      min-height: 260px;
      display: grid;
      place-items: center;
      padding: 24px;
      text-align: center;
      color: var(--text-3);
      font-size: .8rem;
      line-height: 1.55;
      border: 1px dashed rgba(255,255,255,.08);
      border-radius: 18px;
    }

    .um-detail-label {
      display: block;
      margin-bottom: 7px;
      color: var(--text-3);
      font-size: .62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .11em;
    }

    .um-detail-value,
    .um-detail-select {
      width: 100%;
      min-height: 45px;
      margin-bottom: 14px;
      padding: 0 12px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 13px;
      color: var(--text);
      background: rgba(3,7,14,.88);
      font: inherit;
      font-size: .8rem;
      outline: none;
    }

    .um-detail-value:focus,
    .um-detail-select:focus {
      border-color: rgba(124,231,255,.2);
      box-shadow: 0 0 0 3px rgba(124,231,255,.045);
    }

    .um-detail-note {
      margin: -5px 0 14px;
      color: var(--text-3);
      font-size: .66rem;
      line-height: 1.45;
    }

    .um-save {
      width: 100%;
      min-height: 46px;
      border: 1px solid rgba(124,231,255,.18);
      border-radius: 14px;
      color: #f8fbff;
      background: linear-gradient(110deg, rgba(76,141,255,.76), rgba(103,171,255,.76), rgba(145,117,238,.7));
      font: inherit;
      font-size: .78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .07em;
      cursor: pointer;
    }

    .um-save:disabled { opacity: .55; cursor: not-allowed; }

    .um-self-note {
      margin-bottom: 14px;
      padding: 10px 12px;
      border-radius: 12px;
      color: var(--cyan);
      background: rgba(124,231,255,.045);
      border: 1px solid rgba(124,231,255,.1);
      font-size: .66rem;
      line-height: 1.45;
    }

    .um-no-users {
      padding: 22px 10px;
      text-align: center;
      color: var(--text-3);
      font-size: .78rem;
    }

    @media (max-width: 720px) {
      #user-management-modal { padding: 10px; }
      .um-modal-body { grid-template-columns: 1fr; }
      .um-list-pane { border-right: 0; border-bottom: 1px solid rgba(255,255,255,.065); }
      .um-user-list { max-height: 280px; }
      .um-edit-pane { max-height: 340px; overflow-y: auto; }
    }
  `;

  document.head.appendChild(style);
}

function ensureModal() {
  let modal = document.getElementById("user-management-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "user-management-modal";
  modal.innerHTML = `
    <div class="um-modal-box" role="dialog" aria-modal="true" aria-labelledby="um-modal-title">
      <div class="um-modal-head">
        <div>
          <div class="um-modal-title" id="um-modal-title">Gestionare utilizatori</div>
          <div class="um-modal-subtitle">Sunt afișate doar conturile care au un role valid.</div>
        </div>
        <button type="button" class="um-modal-close" id="um-modal-close" aria-label="Închide">×</button>
      </div>

      <div class="um-modal-body">
        <div class="um-list-pane">
          <div class="um-search-shell">
            <span class="um-search-icon">⌕</span>
            <input id="um-modal-search" class="um-search-input" type="search" autocomplete="off" placeholder="Caută după nume, email sau role...">
          </div>
          <div id="um-modal-count" class="um-list-count"></div>
          <div id="um-modal-list" class="um-user-list"></div>
        </div>

        <div class="um-edit-pane">
          <div id="um-modal-detail" class="um-empty-detail">
            Selectează un utilizator pentru a modifica numele, role-ul sau starea contului.
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.classList.remove("show");
  document.getElementById("um-modal-close")?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  document.getElementById("um-modal-search")?.addEventListener("input", (event) => {
    modalSearchTerm = String(event.target.value || "").trim().toLowerCase();
    renderModalUsers();
  });

  return modal;
}

function prepareCompactCard(card) {
  if (!card || card.dataset.compactReady === "true") return;

  card.dataset.compactReady = "true";
  card.innerHTML = `
    <div class="card-head">
      <div class="card-title">
        <span class="card-index">04</span>
        <div>
          <h2>Gestionare utilizatori</h2>
          <p>Administrează conturile care au un role.</p>
        </div>
      </div>
      <span class="card-note">Administrare</span>
    </div>

    <div class="actions-row" style="margin-top:0;">
      <p class="action-copy">Deschide lista compactă pentru a căuta și modifica utilizatorii cu role.</p>
      <button type="button" id="open-user-management" class="btn-submit">Deschide utilizatori</button>
    </div>
  `;

  document.getElementById("open-user-management")?.addEventListener("click", () => {
    const modal = ensureModal();
    modal.classList.add("show");
    renderModalUsers();
    document.getElementById("um-modal-search")?.focus();
  });
}

async function getCurrentUserData(user) {
  if (!user) return null;

  const snap = await getDoc(doc(db, "utilizatori", user.uid));
  const data = snap.exists() ? (snap.data() || {}) : {};

  if (user.email === "tsplayer18@gmail.com" && !data.role && !data.rol) {
    return { ...data, role: "superadmin" };
  }

  return {
    ...data,
    role: normalizeRole(data.role || data.rol)
  };
}

async function loadUsers() {
  try {
    const snapshot = await getDocs(collection(db, "utilizatori"));
    users = snapshot.docs.map((item) => ({
      uid: item.id,
      ...(item.data() || {})
    }));

    users.sort((a, b) => {
      const nameA = String(a.nume || a.name || a.displayName || a.email || "").toLowerCase();
      const nameB = String(b.nume || b.name || b.displayName || b.email || "").toLowerCase();
      return nameA.localeCompare(nameB, "ro");
    });

    renderModalUsers();
  } catch (error) {
    console.error("Eroare la încărcarea utilizatorilor:", error);
    showMessage(`Nu am putut încărca utilizatorii: ${error.message || "Eroare necunoscută"}`, false);
  }
}

function getRoleUsers() {
  return users.filter((user) => ALLOWED_ROLES.includes(normalizeRole(user.role || user.rol)));
}

function getVisibleUsers() {
  const term = modalSearchTerm;
  return getRoleUsers().filter((user) => {
    if (!term) return true;

    const role = normalizeRole(user.role || user.rol);
    return [
      user.uid,
      user.email,
      user.nume,
      user.name,
      user.displayName,
      role
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(term);
  });
}

function initials(value) {
  const text = String(value || "U").trim();
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "U";
}

function renderModalUsers() {
  const list = document.getElementById("um-modal-list");
  const count = document.getElementById("um-modal-count");
  if (!list) return;

  const roleUsers = getRoleUsers();
  const visible = getVisibleUsers();

  if (count) {
    count.textContent = `${visible.length} din ${roleUsers.length} utilizatori cu role`;
  }

  if (!visible.length) {
    list.innerHTML = `<div class="um-no-users">Nu există utilizatori cu role pentru această căutare.</div>`;
    return;
  }

  list.innerHTML = visible.map((user) => {
    const name = user.nume || user.name || user.displayName || "Fără nume";
    const email = user.email || "Fără email";
    const role = normalizeRole(user.role || user.rol);
    const active = isUserActive(user);

    return `
      <button type="button" class="um-user-row ${selectedUserUid === user.uid ? "selected" : ""}" data-user-uid="${escapeHtml(user.uid)}">
        <span class="um-user-avatar">${escapeHtml(initials(name))}</span>
        <span class="um-user-main">
          <span class="um-user-name">${escapeHtml(name)}</span>
          <span class="um-user-email">${escapeHtml(email)}</span>
        </span>
        <span class="um-user-meta">
          <span class="um-role">${escapeHtml(role)}</span>
          <span class="um-active ${active ? "" : "inactive"}">${active ? "Activ" : "Inactiv"}</span>
        </span>
      </button>
    `;
  }).join("");

  list.querySelectorAll(".um-user-row").forEach((row) => {
    row.addEventListener("click", () => {
      selectedUserUid = row.dataset.userUid || null;
      renderModalUsers();
      renderSelectedUser();
    });
  });

  if (selectedUserUid && !visible.some((user) => user.uid === selectedUserUid)) {
    selectedUserUid = null;
    renderSelectedUser();
  }
}

function renderSelectedUser() {
  const detail = document.getElementById("um-modal-detail");
  if (!detail) return;

  const user = getRoleUsers().find((item) => item.uid === selectedUserUid);

  if (!user) {
    detail.className = "um-empty-detail";
    detail.innerHTML = "Selectează un utilizator pentru a modifica numele, role-ul sau starea contului.";
    return;
  }

  const name = user.nume || user.name || user.displayName || "Fără nume";
  const role = normalizeRole(user.role || user.rol);
  const active = isUserActive(user);
  const isSelf = user.uid === currentUid;

  detail.className = "";
  detail.innerHTML = `
    <span class="um-detail-label">Nume</span>
    <input id="um-edit-name" class="um-detail-value" type="text" value="${escapeHtml(name)}">

    <span class="um-detail-label">Role</span>
    <select id="um-edit-role" class="um-detail-select" ${isSelf ? "disabled" : ""}>
      ${ALLOWED_ROLES.map((item) => `<option value="${item}" ${role === item ? "selected" : ""}>${item.toUpperCase()}</option>`).join("")}
    </select>

    <span class="um-detail-label">Stare cont</span>
    <select id="um-edit-active" class="um-detail-select" ${isSelf ? "disabled" : ""}>
      <option value="true" ${active ? "selected" : ""}>ACTIV</option>
      <option value="false" ${!active ? "selected" : ""}>INACTIV</option>
    </select>

    ${isSelf ? `<div class="um-self-note">Acesta este contul tău. Pentru siguranță, role-ul și starea propriului cont nu pot fi modificate aici.</div>` : ""}

    <button type="button" class="um-save" id="um-save-user">Salvează modificările</button>
  `;

  document.getElementById("um-save-user")?.addEventListener("click", () => saveSelectedUser());
}

async function saveSelectedUser() {
  const user = getRoleUsers().find((item) => item.uid === selectedUserUid);
  if (!user) return;

  const button = document.getElementById("um-save-user");
  const nameInput = document.getElementById("um-edit-name");
  const roleSelect = document.getElementById("um-edit-role");
  const activeSelect = document.getElementById("um-edit-active");

  const name = String(nameInput?.value || "").trim();
  const role = normalizeRole(roleSelect?.value || user.role || user.rol);
  const active = activeSelect?.value === "true";

  if (!name) {
    showMessage("Numele utilizatorului nu poate fi gol.", false);
    return;
  }

  if (!ALLOWED_ROLES.includes(role)) {
    showMessage("Rol invalid.", false);
    return;
  }

  if (user.uid === currentUid) {
    if (role !== normalizeRole(user.role || user.rol)) {
      showMessage("Nu îți poți modifica propriul rol.", false);
      return;
    }
    if (active !== isUserActive(user)) {
      showMessage("Nu îți poți modifica propria stare a contului.", false);
      return;
    }
  }

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Se salvează...";
    }

    await updateDoc(doc(db, "utilizatori", user.uid), {
      nume: name,
      role,
      rol: role,
      activ: active,
      active,
      updatedAt: serverTimestamp()
    });

    const index = users.findIndex((item) => item.uid === user.uid);
    if (index !== -1) {
      users[index] = {
        ...users[index],
        nume: name,
        role,
        rol: role,
        activ: active,
        active
      };
    }

    if (user.uid === currentUid) {
      currentUserData = { ...currentUserData, nume: name, role, rol: role, activ: active, active };
      updateCurrentUserStatus(active);
    }

    renderModalUsers();
    renderSelectedUser();
    showMessage(`Utilizatorul ${name} a fost actualizat cu succes.`);
  } catch (error) {
    console.error("Eroare la actualizarea utilizatorului:", error);
    showMessage(`Nu am putut salva modificările: ${error.message || "Eroare necunoscută"}`, false);
  } finally {
    const saveButton = document.getElementById("um-save-user");
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Salvează modificările";
    }
  }
}

async function init() {
  const card = getCard();
  if (!card) return;

  injectModalStyles();
  prepareCompactCard(card);
  ensureModal();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      card.style.display = "none";
      return;
    }

    try {
      currentUid = user.uid;
      currentUserData = await getCurrentUserData(user);
      const role = normalizeRole(currentUserData?.role || currentUserData?.rol);

      if (!["admin", "superadmin"].includes(role)) {
        card.style.display = "none";
        return;
      }

      updateCurrentUserStatus(isUserActive(currentUserData || {}));
      card.style.display = "block";
      await loadUsers();
    } catch (error) {
      console.error("Eroare inițializare gestionare utilizatori:", error);
      card.style.display = "none";
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
