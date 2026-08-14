import { db, auth } from "./firebase-config.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const STYLE_ID = "admin-rejection-modal-styles";
const MODAL_ID = "admin-rejection-modal";
let activeRequest = null;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function currentAdminName() {
  const user = auth.currentUser;
  return user?.displayName || user?.email || "Administrator";
}

function ownerUid(item) {
  const candidates = [
    item?.ownerUid,
    item?.ownerUID,
    item?.firebaseUid,
    item?.firebaseUID,
    item?.userUid,
    item?.userUID,
    item?.uid,
    item?.userId,
    item?.user_id,
    item?.utilizatorId,
    item?.createdByUid,
    item?.created_by_uid,
    item?.submittedByUid,
    item?.requesterUid,
    item?.requesterId
  ];
  return candidates
    .map(v => String(v || "").trim())
    .find(v => v.length >= 20 && v !== "undefined" && v !== "null") || null;
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${MODAL_ID}{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:20px;background:rgba(2,5,12,.78);opacity:0;visibility:hidden;transition:.2s ease}
    #${MODAL_ID}.open{opacity:1;visibility:visible}
    #${MODAL_ID} .rejection-box{width:min(560px,100%);border:1px solid rgba(255,255,255,.14);border-radius:26px;background:linear-gradient(155deg,rgba(22,31,49,.99),rgba(8,13,25,.99));box-shadow:0 40px 100px rgba(0,0,0,.58);padding:24px}
    #${MODAL_ID} .rejection-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
    #${MODAL_ID} .rejection-title{font-size:1.35rem;font-weight:780;color:#ff6961}
    #${MODAL_ID} .rejection-subtitle{margin-top:6px;color:#a9b4c8;font-size:.9rem}
    #${MODAL_ID} .rejection-close{width:40px;height:40px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.05);color:#fff;font-size:1.25rem;cursor:pointer}
    #${MODAL_ID} .rejection-label{display:block;color:#b8c0d0;font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
    #${MODAL_ID} textarea{width:100%;min-height:145px;resize:vertical;border:1px solid rgba(255,255,255,.1);border-radius:15px;padding:14px;background:rgba(255,255,255,.045);color:#fff;outline:none;font:inherit;line-height:1.5}
    #${MODAL_ID} textarea:focus{border-color:rgba(255,105,97,.42);box-shadow:0 0 0 3px rgba(255,105,97,.08)}
    #${MODAL_ID} .rejection-footer{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
    #${MODAL_ID} .rejection-btn{border:1px solid rgba(255,255,255,.1);border-radius:13px;padding:11px 17px;color:#fff;background:rgba(255,255,255,.06);cursor:pointer;font-weight:700}
    #${MODAL_ID} .rejection-btn:hover{background:rgba(255,255,255,.1)}
    #${MODAL_ID} .rejection-btn-danger{background:rgba(255,105,97,.14);border-color:rgba(255,105,97,.3);color:#ffd9d6}
    #${MODAL_ID} .rejection-btn-danger:disabled{opacity:.55;cursor:not-allowed}
    #${MODAL_ID} .rejection-error{display:none;margin-top:8px;color:#ff9b96;font-size:.84rem}
    @media(max-width:760px){#${MODAL_ID}{padding:10px}#${MODAL_ID} .rejection-box{padding:18px;border-radius:20px}#${MODAL_ID} .rejection-footer{flex-direction:column}#${MODAL_ID} .rejection-btn{width:100%}}
  `;
  document.head.appendChild(style);
}

function ensureModal() {
  if (document.getElementById(MODAL_ID)) return document.getElementById(MODAL_ID);
  const modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.innerHTML = `
    <div class="rejection-box" role="dialog" aria-modal="true" aria-labelledby="admin-rejection-title">
      <div class="rejection-head">
        <div>
          <div id="admin-rejection-title" class="rejection-title">Respinge cererea</div>
          <div class="rejection-subtitle">Introdu motivul pentru respingere. Va fi salvat în cerere și trimis în notificare.</div>
        </div>
        <button type="button" class="rejection-close" id="admin-rejection-close" aria-label="Închide">×</button>
      </div>
      <label class="rejection-label" for="admin-rejection-reason">Motivul respingerii</label>
      <textarea id="admin-rejection-reason" maxlength="2000" placeholder="Scrie motivul respingerii..."></textarea>
      <div id="admin-rejection-error" class="rejection-error"></div>
      <div class="rejection-footer">
        <button type="button" class="rejection-btn" id="admin-rejection-cancel">Anulează</button>
        <button type="button" class="rejection-btn rejection-btn-danger" id="admin-rejection-submit">Respinge cererea</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => {
    modal.classList.remove("open");
    activeRequest = null;
  };
  modal.addEventListener("click", event => { if (event.target === modal) close(); });
  modal.querySelector("#admin-rejection-close").addEventListener("click", close);
  modal.querySelector("#admin-rejection-cancel").addEventListener("click", close);
  modal.querySelector("#admin-rejection-submit").addEventListener("click", submitRejection);
  return modal;
}

function openRejection(item) {
  if (!item?.id) return;
  activeRequest = item;
  const modal = ensureModal();
  const reason = modal.querySelector("#admin-rejection-reason");
  const error = modal.querySelector("#admin-rejection-error");
  const submit = modal.querySelector("#admin-rejection-submit");
  reason.value = "";
  error.style.display = "none";
  error.textContent = "";
  submit.disabled = false;
  modal.classList.add("open");
  setTimeout(() => reason.focus(), 50);
}

async function submitRejection() {
  const modal = ensureModal();
  const reasonEl = modal.querySelector("#admin-rejection-reason");
  const errorEl = modal.querySelector("#admin-rejection-error");
  const submit = modal.querySelector("#admin-rejection-submit");
  const reason = String(reasonEl.value || "").trim();
  const item = activeRequest;
  if (!item?.id) return;

  if (!reason) {
    errorEl.textContent = "Introdu motivul respingerii.";
    errorEl.style.display = "block";
    reasonEl.focus();
    return;
  }

  submit.disabled = true;
  errorEl.style.display = "none";

  try {
    const updateData = {
      status: "respins",
      rejectionReason: reason,
      motivRespingere: reason,
      motiv_respingere: reason,
      procesat_de: `${currentAdminName()} (Respins cererea)`,
      data_procesare: new Date().toLocaleString("ro-RO"),
      updatedAt: serverTimestamp(),
      deleted: false
    };

    await updateDoc(doc(db, "cereri", String(item.id)), updateData);

    const recipientId = ownerUid(item);
    if (recipientId) {
      await addDoc(collection(db, "notificari"), {
        recipientId,
        title: "Cerere respinsă",
        message: `Cererea ${item.id} a fost respinsă. Motiv: ${reason}`,
        type: "error",
        requestId: String(item.id),
        requestUrl: `cererile_mele.html?cerere=${encodeURIComponent(item.id)}`,
        status: "respins",
        actorName: currentAdminName(),
        actorRole: "admin",
        rejectionReason: reason,
        read: false,
        createdAt: serverTimestamp()
      });
    }

    if (typeof window.showToast === "function") {
      window.showToast("Cererea a fost respinsă și motivul a fost trimis utilizatorului.", "success");
    }

    modal.classList.remove("open");
    activeRequest = null;
  } catch (error) {
    console.error("Rejection flow:", error);
    errorEl.textContent = error?.message || "Nu s-a putut respinge cererea.";
    errorEl.style.display = "block";
    submit.disabled = false;
  }
}

function findRequest(id) {
  if (!id) return null;
  const source = window.allCereri || [];
  return source.find(item => String(item?.id) === String(id)) || null;
}

document.addEventListener("click", event => {
  const button = event.target.closest(".btn-reject[data-id]");
  if (!button) return;
  const item = findRequest(button.getAttribute("data-id"));
  if (!item) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  openRejection(item);
}, true);

injectStyles();
ensureModal();
