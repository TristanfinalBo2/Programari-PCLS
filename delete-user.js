import { auth, db } from "./firebase-config.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const functions = getFunctions();
const deleteUserAccount = httpsCallable(functions, "deleteUserAccount");

function currentSelectedUid() {
  return document.querySelector(".um-user-row.selected")?.dataset?.userUid || null;
}

function addDeleteButton(detail) {
  if (!detail || detail.querySelector("#um-delete-user")) return;

  const saveButton = detail.querySelector("#um-save-user");
  if (!saveButton) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "um-delete-user";
  button.className = "um-delete";
  button.textContent = "Șterge contul";
  button.addEventListener("click", deleteSelectedUser);

  saveButton.insertAdjacentElement("afterend", button);
}

async function canDeleteTarget(uid) {
  const currentUser = auth.currentUser;
  if (!currentUser || !uid) return { allowed: false, message: "Sesiunea nu este activă." };

  if (uid === currentUser.uid) {
    return { allowed: false, message: "Nu îți poți șterge propriul cont din această zonă." };
  }

  const requesterSnap = await getDoc(doc(db, "utilizatori", currentUser.uid));
  const requester = requesterSnap.exists() ? requesterSnap.data() || {} : {};
  const requesterRole = String(requester.role || requester.rol || "").trim().toLowerCase();

  if (!["admin", "superadmin"].includes(requesterRole)) {
    return { allowed: false, message: "Nu ai permisiunea de a șterge conturi." };
  }

  const targetSnap = await getDoc(doc(db, "utilizatori", uid));
  if (targetSnap.exists()) {
    const target = targetSnap.data() || {};
    const targetRole = String(target.role || target.rol || "").trim().toLowerCase();

    if (targetRole === "superadmin" && requesterRole !== "superadmin") {
      return { allowed: false, message: "Doar un superadmin poate șterge un superadmin." };
    }
  }

  return { allowed: true };
}

async function deleteSelectedUser() {
  const uid = currentSelectedUid();
  if (!uid) return;

  const nameInput = document.getElementById("um-edit-name");
  const name = String(nameInput?.value || "utilizator").trim() || "utilizator";

  const allowed = await canDeleteTarget(uid);
  if (!allowed.allowed) {
    window.alert(allowed.message);
    return;
  }

  const confirmed = window.confirm(
    `ATENȚIE!\n\nVrei să ștergi definitiv contul „${name}”?\n\n` +
    "Se vor elimina contul Firebase Authentication și profilul Firestore. Operațiunea nu poate fi anulată."
  );

  if (!confirmed) return;

  const button = document.getElementById("um-delete-user");
  if (button) {
    button.disabled = true;
    button.textContent = "Se șterge...";
  }

  try {
    const result = await deleteUserAccount({ uid });
    const message = result?.data?.message || "Contul a fost șters.";

    const row = document.querySelector(`.um-user-row[data-user-uid="${CSS.escape(uid)}"]`);
    row?.remove();

    const modalDetail = document.getElementById("um-modal-detail");
    if (modalDetail) {
      modalDetail.className = "um-empty-detail";
      modalDetail.textContent = "Contul a fost șters. Selectează alt utilizator.";
    }

    window.alert(message);

    // Reîncarcă lista pentru a elimina definitiv utilizatorul din memoria modulului.
    window.location.reload();
  } catch (error) {
    console.error("Eroare la ștergerea contului:", error);
    window.alert(error?.message || "Nu am putut șterge contul.");
    if (button) {
      button.disabled = false;
      button.textContent = "Șterge contul";
    }
  }
}

function injectDeleteStyles() {
  if (document.getElementById("um-delete-style")) return;

  const style = document.createElement("style");
  style.id = "um-delete-style";
  style.textContent = `
    .um-delete {
      width: 100%;
      min-height: 44px;
      margin-top: 9px;
      border: 1px solid rgba(255,113,133,.22);
      border-radius: 13px;
      color: #ffdce2;
      background: rgba(255,113,133,.06);
      font: inherit;
      font-size: .74rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .07em;
      cursor: pointer;
      transition: background .2s ease, border-color .2s ease, transform .2s ease;
    }
    .um-delete:hover {
      background: rgba(255,113,133,.1);
      border-color: rgba(255,113,133,.35);
      transform: translateY(-1px);
    }
    .um-delete:disabled { opacity: .55; cursor: not-allowed; transform: none; }
  `;
  document.head.appendChild(style);
}

function initDeleteIntegration() {
  injectDeleteStyles();

  const observer = new MutationObserver(() => {
    const detail = document.getElementById("um-modal-detail");
    if (detail && detail.querySelector("#um-save-user")) {
      addDeleteButton(detail);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  const existing = document.getElementById("um-modal-detail");
  if (existing) addDeleteButton(existing);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDeleteIntegration, { once: true });
} else {
  initDeleteIntegration();
}
