import { db, auth } from "./firebase-config.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const MODAL_ID = "admin-rejection-v2-modal";
let activeRequestId = null;

function injectStyles() {
  if (document.getElementById("admin-rejection-v2-styles")) return;
  const style = document.createElement("style");
  style.id = "admin-rejection-v2-styles";
  style.textContent = `
    #${MODAL_ID}{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:20px;background:rgba(2,5,12,.78);opacity:0;visibility:hidden;transition:.2s ease}
    #${MODAL_ID}.open{opacity:1;visibility:visible}
    #${MODAL_ID} .box{width:min(560px,100%);border:1px solid rgba(255,255,255,.14);border-radius:26px;background:linear-gradient(155deg,rgba(22,31,49,.99),rgba(8,13,25,.99));box-shadow:0 40px 100px rgba(0,0,0,.58);padding:24px}
    #${MODAL_ID} .head{display:flex;justify-content:space-between;gap:16px;margin-bottom:18px}
    #${MODAL_ID} .title{font-size:1.35rem;font-weight:780;color:#ff6961}
    #${MODAL_ID} .sub{margin-top:6px;color:#a9b4c8;font-size:.9rem;line-height:1.45}
    #${MODAL_ID} .close{width:40px;height:40px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.05);color:#fff;font-size:1.25rem;cursor:pointer}
    #${MODAL_ID} label{display:block;color:#b8c0d0;font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
    #${MODAL_ID} textarea{width:100%;min-height:145px;resize:vertical;border:1px solid rgba(255,255,255,.1);border-radius:15px;padding:14px;background:rgba(255,255,255,.045);color:#fff;outline:none;font:inherit;line-height:1.5}
    #${MODAL_ID} .error{display:none;margin-top:8px;color:#ff9b96;font-size:.84rem}
    #${MODAL_ID} .footer{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
    #${MODAL_ID} button.action{border:1px solid rgba(255,255,255,.1);border-radius:13px;padding:11px 17px;color:#fff;background:rgba(255,255,255,.06);cursor:pointer;font-weight:700}
    #${MODAL_ID} button.danger{background:rgba(255,105,97,.14);border-color:rgba(255,105,97,.3);color:#ffd9d6}
    #${MODAL_ID} button:disabled{opacity:.55;cursor:not-allowed}
    @media(max-width:760px){#${MODAL_ID}{padding:10px}#${MODAL_ID} .box{padding:18px;border-radius:20px}#${MODAL_ID} .footer{flex-direction:column}#${MODAL_ID} button.action{width:100%}}
  `;
  document.head.appendChild(style);
}

function currentAdminName() {
  const user = auth.currentUser;
  return user?.displayName || user?.email || "Administrator";
}

function ensureModal() {
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.innerHTML = `
    <div class="box" role="dialog" aria-modal="true" aria-labelledby="admin-rejection-v2-title">
      <div class="head">
        <div>
          <div id="admin-rejection-v2-title" class="title">Respinge cererea</div>
          <div class="sub">Introdu motivul. Cererea va deveni „Respinsă”, iar popup-ul de notificări îl va afișa automat utilizatorului.</div>
        </div>
        <button class="close" type="button" id="admin-rejection-v2-close">×</button>
      </div>
      <label for="admin-rejection-v2-reason">Motivul respingerii</label>
      <textarea id="admin-rejection-v2-reason" maxlength="2000" placeholder="Scrie motivul respingerii..."></textarea>
      <div id="admin-rejection-v2-error" class="error"></div>
      <div class="footer">
        <button class="action" type="button" id="admin-rejection-v2-cancel">Anulează</button>
        <button class="action danger" type="button" id="admin-rejection-v2-submit">Respinge cererea</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => { modal.classList.remove("open"); activeRequestId = null; };
  modal.addEventListener("click", event => { if (event.target === modal) close(); });
  modal.querySelector("#admin-rejection-v2-close").addEventListener("click", close);
  modal.querySelector("#admin-rejection-v2-cancel").addEventListener("click", close);
  modal.querySelector("#admin-rejection-v2-submit").addEventListener("click", submit);
  return modal;
}

function open(id) {
  activeRequestId = String(id || "").trim();
  if (!activeRequestId) return;
  const modal = ensureModal();
  modal.querySelector("#admin-rejection-v2-reason").value = "";
  modal.querySelector("#admin-rejection-v2-error").style.display = "none";
  modal.querySelector("#admin-rejection-v2-submit").disabled = false;
  modal.classList.add("open");
  setTimeout(() => modal.querySelector("#admin-rejection-v2-reason").focus(), 40);
}

async function submit() {
  const modal = ensureModal();
  const reasonEl = modal.querySelector("#admin-rejection-v2-reason");
  const errorEl = modal.querySelector("#admin-rejection-v2-error");
  const submitBtn = modal.querySelector("#admin-rejection-v2-submit");
  const reason = String(reasonEl.value || "").trim();
  const id = activeRequestId;

  if (!id) return;
  if (!reason) {
    errorEl.textContent = "Introdu motivul respingerii.";
    errorEl.style.display = "block";
    reasonEl.focus();
    return;
  }

  submitBtn.disabled = true;
  errorEl.style.display = "none";

  try {
    const ref = doc(db, "cereri", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Cererea nu mai există.");

    await updateDoc(ref, {
      status: "respins",
      rejectionReason: reason,
      motivRespingere: reason,
      motiv_respingere: reason,
      procesat_de: `${currentAdminName()} (Respins cererea)`,
      data_procesare: new Date().toLocaleString("ro-RO"),
      updatedAt: serverTimestamp(),
      deleted: false
    });

    if (typeof window.showToast === "function") {
      window.showToast("Cererea a fost respinsă.", "success");
    }

    modal.classList.remove("open");
    activeRequestId = null;
  } catch (error) {
    console.error("Rejection flow:", error);
    errorEl.textContent = error?.message || "Nu s-a putut respinge cererea.";
    errorEl.style.display = "block";
    submitBtn.disabled = false;
  }
}

document.addEventListener("click", event => {
  const button = event.target.closest(".btn-reject[data-id]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  open(button.getAttribute("data-id"));
}, true);

injectStyles();
ensureModal();