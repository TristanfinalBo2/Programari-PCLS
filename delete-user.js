import { auth, db } from "./firebase-config.js";
import {
  getDoc,
  doc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const TOGGLE_ID = "um-delete-user";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showInAppToast(message, type = "success") {
  let container = document.getElementById("um-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "um-toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `um-toast um-toast-${type}`;
  toast.innerHTML = `
    <div class="um-toast-icon">${type === "success" ? "✓" : type === "error" ? "!" : "i"}</div>
    <div class="um-toast-content">${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 220);
  }, 4200);
}

function ensureConfirmModal() {
  let overlay = document.getElementById("um-confirm-modal");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "um-confirm-modal";
  overlay.innerHTML = `
    <div class="um-confirm-box" role="dialog" aria-modal="true" aria-labelledby="um-confirm-title">
      <div class="um-confirm-icon" id="um-confirm-icon">!</div>
      <div class="um-confirm-title" id="um-confirm-title">Confirmare</div>
      <div class="um-confirm-message" id="um-confirm-message"></div>
      <div class="um-confirm-actions">
        <button type="button" class="um-confirm-cancel" id="um-confirm-cancel">Anulează</button>
        <button type="button" class="um-confirm-ok" id="um-confirm-ok">Confirmă</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

function showConfirmModal({ title, message, confirmText, danger }) {
  const overlay = ensureConfirmModal();
  const titleEl = overlay.querySelector("#um-confirm-title");
  const messageEl = overlay.querySelector("#um-confirm-message");
  const cancelBtn = overlay.querySelector("#um-confirm-cancel");
  const okBtn = overlay.querySelector("#um-confirm-ok");

  titleEl.textContent = title;
  messageEl.textContent = message;
  okBtn.textContent = confirmText;
  okBtn.classList.toggle("danger", danger === true);

  return new Promise((resolve) => {
    const finish = (value) => {
      overlay.classList.remove("show");
      cancelBtn.onclick = null;
      okBtn.onclick = null;
      overlay.onclick = null;
      resolve(value);
    };

    cancelBtn.onclick = () => finish(false);
    okBtn.onclick = () => finish(true);
    overlay.onclick = (event) => {
      if (event.target === overlay) finish(false);
    };

    overlay.classList.add("show");
  });
}

function getSelectedUid() {
  return window.__pclsSelectedUserUid ||
    document.querySelector(".um-user-row.selected")?.dataset?.userUid ||
    null;
}

function getSelectedName() {
  return String(document.getElementById("um-edit-name")?.value || "utilizator").trim() || "utilizator";
}

function getCurrentStatus() {
  const select = document.getElementById("um-edit-active");
  return select ? select.value === "true" : true;
}

function updateToggleButton() {
  const button = document.getElementById(TOGGLE_ID);
  if (!button) return;

  const active = getCurrentStatus();
  const disabledForSelf = document.getElementById("um-edit-role")?.disabled === true;

  button.textContent = active ? "Dezactivează contul" : "Reactivează contul";
  button.classList.toggle("reactivate", !active);
  button.disabled = disabledForSelf;
}

async function canManageTarget(uid) {
  const currentUser = auth.currentUser;
  if (!currentUser || !uid) {
    return { allowed: false, message: "Sesiunea nu este activă." };
  }

  if (uid === currentUser.uid) {
    return { allowed: false, message: "Nu îți poți modifica propriul status din această zonă." };
  }

  const requesterSnap = await getDoc(doc(db, "utilizatori", currentUser.uid));
  const requester = requesterSnap.exists() ? requesterSnap.data() || {} : {};
  const requesterRole = String(requester.role || requester.rol || "").trim().toLowerCase();

  if (!["admin", "superadmin"].includes(requesterRole)) {
    return { allowed: false, message: "Nu ai permisiunea de a modifica conturi." };
  }

  const targetSnap = await getDoc(doc(db, "utilizatori", uid));
  if (targetSnap.exists()) {
    const target = targetSnap.data() || {};
    const targetRole = String(target.role || target.rol || "").trim().toLowerCase();

    if (targetRole === "superadmin" && requesterRole !== "superadmin") {
      return { allowed: false, message: "Doar un superadmin poate modifica un superadmin." };
    }
  }

  return { allowed: true };
}

async function writeAdminNotification(title, message, type = "info") {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    await addDoc(collection(db, "notificari"), {
      recipientId: currentUser.uid,
      title,
      message,
      type,
      read: false,
      createdAt: serverTimestamp(),
      source: "gestionare_utilizatori",
      requestId: ""
    });
  } catch (error) {
    console.error("Nu am putut crea notificarea:", error);
  }
}

async function toggleSelectedUserStatus() {
  const uid = getSelectedUid();
  if (!uid) {
    showInAppToast("Selectează mai întâi un utilizator.", "error");
    return;
  }

  const nextActive = !getCurrentStatus();
  const name = getSelectedName();

  const allowed = await canManageTarget(uid);
  if (!allowed.allowed) {
    showInAppToast(allowed.message, "error");
    return;
  }

  const confirmed = await showConfirmModal({
    title: nextActive ? "Reactivează contul" : "Dezactivează contul",
    message: nextActive
      ? `Contul „${name}” va reveni în starea ACTIV.`
      : `Contul „${name}” va fi trecut în starea INACTIV. Datele nu vor fi șterse și contul poate fi reactivat ulterior.`,
    confirmText: nextActive ? "Reactivează" : "Dezactivează",
    danger: !nextActive
  });

  if (!confirmed) return;

  const button = document.getElementById(TOGGLE_ID);
  if (button) {
    button.disabled = true;
    button.textContent = nextActive ? "Se reactivează..." : "Se dezactivează...";
  }

  try {
    await updateDoc(doc(db, "utilizatori", uid), {
      activ: nextActive,
      active: nextActive,
      enabled: nextActive,
      updatedAt: serverTimestamp()
    });

    const activeSelect = document.getElementById("um-edit-active");
    if (activeSelect) activeSelect.value = nextActive ? "true" : "false";

    const row = [...document.querySelectorAll(".um-user-row")].find((item) => item.dataset.userUid === uid);
    const status = row?.querySelector(".um-active");
    if (status) {
      status.classList.toggle("inactive", !nextActive);
      status.textContent = nextActive ? "Activ" : "Inactiv";
    }

    await writeAdminNotification(
      nextActive ? "Cont reactivat" : "Cont dezactivat",
      `${name} a fost ${nextActive ? "reactivat" : "dezactivat"}.`,
      nextActive ? "success" : "warning"
    );

    showInAppToast(
      nextActive ? `Contul „${name}” a fost reactivat.` : `Contul „${name}” a fost dezactivat.`,
      "success"
    );
  } catch (error) {
    console.error("Eroare la modificarea statusului contului:", error);
    showInAppToast(error?.message || "Nu am putut modifica starea contului.", "error");
  } finally {
    const currentButton = document.getElementById(TOGGLE_ID);
    if (currentButton) {
      currentButton.disabled = false;
      updateToggleButton();
    }
  }
}

function ensureToggleButton() {
  const detail = document.getElementById("um-modal-detail");
  if (!detail) return;

  const saveButton = detail.querySelector("#um-save-user");
  if (!saveButton || document.getElementById(TOGGLE_ID)) {
    updateToggleButton();
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.id = TOGGLE_ID;
  button.className = "um-delete";
  button.addEventListener("click", toggleSelectedUserStatus);
  saveButton.insertAdjacentElement("afterend", button);
  updateToggleButton();
}

function injectStyles() {
  if (document.getElementById("um-status-management-style")) return;

  const style = document.createElement("style");
  style.id = "um-status-management-style";
  style.textContent = `
    .um-delete{width:100%;min-height:44px;margin-top:9px;border:1px solid rgba(255,113,133,.22);border-radius:13px;color:#ffdce2;background:rgba(255,113,133,.06);font:inherit;font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;cursor:pointer;transition:.2s ease}
    .um-delete:hover{background:rgba(255,113,133,.1);border-color:rgba(255,113,133,.35);transform:translateY(-1px)}
    .um-delete.reactivate{color:#d3ffed;border-color:rgba(99,230,190,.24);background:rgba(99,230,190,.07)}
    .um-delete.reactivate:hover{background:rgba(99,230,190,.12);border-color:rgba(99,230,190,.38)}
    .um-delete:disabled{opacity:.55;cursor:not-allowed;transform:none}
    #um-toast-container{position:fixed;right:22px;bottom:22px;z-index:12000;width:min(380px,calc(100vw - 30px));display:grid;gap:10px;pointer-events:none}
    .um-toast{display:flex;align-items:center;gap:11px;padding:13px 15px;border:1px solid rgba(255,255,255,.11);border-radius:16px;background:linear-gradient(145deg,rgba(27,35,53,.97),rgba(12,17,29,.97));box-shadow:0 22px 55px rgba(0,0,0,.45),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(18px) saturate(160%);opacity:0;transform:translateY(12px) scale(.98);transition:.22s ease}
    .um-toast.show{opacity:1;transform:translateY(0) scale(1)}
    .um-toast-icon{width:28px;height:28px;flex:0 0 28px;display:grid;place-items:center;border-radius:9px;color:var(--mint);background:rgba(99,230,190,.1);font-weight:800}
    .um-toast-error .um-toast-icon{color:var(--danger);background:rgba(255,105,97,.1)}
    .um-toast-warning .um-toast-icon{color:var(--gold);background:rgba(255,214,10,.1)}
    .um-toast-content{color:var(--text);font-size:.78rem;line-height:1.45}
    #um-confirm-modal{position:fixed;inset:0;z-index:11500;display:none;place-items:center;padding:18px;background:rgba(2,5,12,.72);backdrop-filter:blur(16px) saturate(130%)}
    #um-confirm-modal.show{display:grid}
    .um-confirm-box{width:min(440px,100%);padding:23px;border:1px solid rgba(255,255,255,.13);border-radius:24px;background:linear-gradient(150deg,rgba(27,35,53,.98),rgba(9,14,25,.98));box-shadow:0 35px 90px rgba(0,0,0,.58),inset 0 1px rgba(255,255,255,.06)}
    .um-confirm-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;color:var(--gold);background:rgba(255,214,10,.1);border:1px solid rgba(255,214,10,.18);font-weight:850;margin-bottom:15px}
    .um-confirm-title{color:var(--text);font-size:1.08rem;font-weight:750}.um-confirm-message{margin-top:8px;color:var(--muted);font-size:.82rem;line-height:1.55}
    .um-confirm-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.um-confirm-cancel,.um-confirm-ok{min-height:40px;padding:0 14px;border-radius:12px;font:inherit;font-size:.74rem;font-weight:750;cursor:pointer}
    .um-confirm-cancel{color:var(--text);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09)}.um-confirm-ok{color:#041015;background:var(--mint);border:1px solid rgba(99,230,190,.28)}.um-confirm-ok.danger{color:#fff;background:linear-gradient(135deg,#ff6961,#e6495b);border-color:rgba(255,105,97,.4)}
  `;
  document.head.appendChild(style);
}

function initStatusManagement() {
  injectStyles();

  const observer = new MutationObserver(() => {
    try {
      ensureToggleButton();
    } catch (error) {
      console.error("Gestionarea statusului utilizatorului a întâmpinat o eroare:", error);
    }
  });

  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  ensureToggleButton();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initStatusManagement, { once: true });
} else {
  initStatusManagement();
}
