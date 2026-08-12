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
const LIST_ID = "usersList";
const LOADING_ID = "usersLoading";
const SEARCH_ID = "userSearch";

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

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getCard() {
  return document.getElementById(CARD_ID);
}

function getList() {
  return document.getElementById(LIST_ID);
}

function getLoading() {
  return document.getElementById(LOADING_ID);
}

function getSearch() {
  return document.getElementById(SEARCH_ID);
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

async function getCurrentRole(user) {
  if (!user) return "";

  if (user.email === "tsplayer18@gmail.com") {
    return "superadmin";
  }

  const snap = await getDoc(doc(db, "utilizatori", user.uid));
  if (!snap.exists()) return "";

  const data = snap.data() || {};
  return normalizeRole(data.role || data.rol);
}

async function loadUsers() {
  const list = getList();
  const loading = getLoading();

  if (!list) return;

  try {
    if (loading) loading.style.display = "block";
    list.innerHTML = "";

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

    renderUsers();
  } catch (error) {
    console.error("Eroare la încărcarea utilizatorilor:", error);
    list.innerHTML = `
      <div class="user-management-error">
        Nu am putut încărca utilizatorii.<br>
        <small>${escapeHtml(error.message || "Eroare necunoscută")}</small>
      </div>
    `;
  } finally {
    if (loading) loading.style.display = "none";
  }
}

function renderUsers() {
  const list = getList();
  const search = getSearch();
  if (!list) return;

  const term = String(search?.value || "").trim().toLowerCase();

  const filtered = users.filter((user) => {
    if (!term) return true;

    return [
      user.uid,
      user.email,
      user.nume,
      user.name,
      user.displayName,
      user.role,
      user.rol
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(term);
  });

  if (!filtered.length) {
    list.innerHTML = `
      <div class="user-management-empty">
        Nu există utilizatori care corespund căutării.
      </div>
    `;
    return;
  }

  list.innerHTML = `
    <div class="user-management-list">
      ${filtered.map(renderUser).join("")}
    </div>
  `;

  list.querySelectorAll(".user-management-save").forEach((button) => {
    button.addEventListener("click", () => saveUser(button.dataset.uid, button));
  });
}

function renderUser(user) {
  const name = user.nume || user.name || user.displayName || "Fără nume";
  const email = user.email || "Fără email";
  const role = normalizeRole(user.role || user.rol) || "utilizator";
  const active = user.activ !== false && user.active !== false && user.enabled !== false;
  const isSelf = currentUid === user.uid;

  const roleOptions = ALLOWED_ROLES.map((item) => `
    <option value="${item}" ${role === item ? "selected" : ""}>
      ${item.toUpperCase()}
    </option>
  `).join("");

  return `
    <article class="user-management-item" data-user-uid="${escapeHtml(user.uid)}">
      <div class="user-management-header">
        <div class="user-management-identity">
          <div class="user-management-name">${escapeHtml(name)}</div>
          <div class="user-management-email">${escapeHtml(email)}</div>
          <div class="user-management-uid">UID: ${escapeHtml(user.uid)}</div>
          ${isSelf ? `<div class="user-management-self">Contul tău</div>` : ""}
        </div>
        <div class="user-status-badge ${active ? "user-status-active" : "user-status-inactive"}">
          ${active ? "Activ" : "Inactiv"}
        </div>
      </div>

      <div class="user-management-fields">
        <div class="user-management-field">
          <label>Nume</label>
          <input class="user-management-control managed-name" type="text" value="${escapeHtml(name)}">
        </div>

        <div class="user-management-field">
          <label>Role</label>
          <select class="user-management-control managed-role" ${isSelf ? "disabled" : ""}>
            ${roleOptions}
          </select>
        </div>

        <div class="user-management-field">
          <label>Status</label>
          <select class="user-management-control managed-active">
            <option value="true" ${active ? "selected" : ""}>ACTIV</option>
            <option value="false" ${!active ? "selected" : ""}>INACTIV</option>
          </select>
        </div>

        <button type="button" class="user-management-save" data-uid="${escapeHtml(user.uid)}">
          Salvează
        </button>
      </div>
    </article>
  `;
}

async function saveUser(uid, button) {
  const item = document.querySelector(`.user-management-item[data-user-uid="${CSS.escape(uid)}"]`);
  if (!item) return;

  const nameInput = item.querySelector(".managed-name");
  const roleSelect = item.querySelector(".managed-role");
  const activeSelect = item.querySelector(".managed-active");

  const name = String(nameInput?.value || "").trim();
  const role = normalizeRole(roleSelect?.value);
  const active = activeSelect?.value === "true";

  if (!name) {
    showMessage("Numele utilizatorului nu poate fi gol.", false);
    return;
  }

  if (!ALLOWED_ROLES.includes(role)) {
    showMessage("Rol invalid.", false);
    return;
  }

  const existing = users.find((user) => user.uid === uid);
  const oldRole = normalizeRole(existing?.role || existing?.rol);

  if (uid === currentUid && role !== oldRole) {
    showMessage("Nu îți poți modifica propriul rol.", false);
    return;
  }

  try {
    button.disabled = true;
    button.textContent = "Se salvează...";

    await updateDoc(doc(db, "utilizatori", uid), {
      nume: name,
      role,
      rol: role,
      activ: active,
      active,
      updatedAt: serverTimestamp()
    });

    const index = users.findIndex((user) => user.uid === uid);
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

    renderUsers();
    showMessage(`Utilizatorul ${name} a fost actualizat cu succes.`);
  } catch (error) {
    console.error("Eroare la actualizarea utilizatorului:", error);
    showMessage(
      `Nu am putut salva modificările: ${error.message || "Eroare necunoscută"}`,
      false
    );
  } finally {
    button.disabled = false;
    button.textContent = "Salvează";
  }
}

async function init() {
  const card = getCard();
  if (!card) return;

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      card.style.display = "none";
      return;
    }

    try {
      currentUid = user.uid;
      const role = await getCurrentRole(user);

      if (!["admin", "superadmin"].includes(role)) {
        card.style.display = "none";
        return;
      }

      card.style.display = "block";
      await loadUsers();
    } catch (error) {
      console.error("Eroare inițializare gestionare utilizatori:", error);
      card.style.display = "none";
    }
  });

  getSearch()?.addEventListener("input", renderUsers);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
