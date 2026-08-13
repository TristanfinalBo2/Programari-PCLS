import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ADMIN_ROLES = new Set(["admin", "superadmin"]);

function addStyles() {
  if (document.getElementById("audit-cleaner-style")) return;
  const style = document.createElement("style");
  style.id = "audit-cleaner-style";
  style.textContent = `
    .audit-clear-btn{background:rgba(255,105,97,.08)!important;border-color:rgba(255,105,97,.2)!important;color:#ffd7d4!important}
    .audit-clear-btn:hover{background:rgba(255,105,97,.14)!important;border-color:rgba(255,105,97,.3)!important}
    .audit-clear-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.72);backdrop-filter:blur(10px)}
    .audit-clear-modal.open{display:flex}
    .audit-clear-box{width:min(520px,100%);padding:24px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:linear-gradient(145deg,rgba(22,30,48,.98),rgba(8,13,23,.98));box-shadow:0 30px 90px rgba(0,0,0,.6)}
    .audit-clear-title{font-size:1.08rem;font-weight:800}.audit-clear-copy{margin-top:8px;color:#b8c0d0;font-size:.78rem;line-height:1.55}
    .audit-clear-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.audit-clear-actions button{padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#f7f9ff;font-weight:700;cursor:pointer}.audit-clear-actions .danger{background:rgba(255,105,97,.12);border-color:rgba(255,105,97,.25);color:#ffd7d4}
    .audit-clear-status{min-height:18px;margin-top:10px;font-size:.73rem;color:#b8c0d0}.audit-clear-status.err{color:#ffd7d4}.audit-clear-status.ok{color:#caffec}
    @media(max-width:760px){.audit-clear-actions{display:grid;grid-template-columns:1fr}.audit-clear-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

function createModal() {
  if (document.getElementById("auditClearModal")) return document.getElementById("auditClearModal");
  const modal = document.createElement("div");
  modal.id = "auditClearModal";
  modal.className = "audit-clear-modal";
  modal.innerHTML = `
    <div class="audit-clear-box" role="dialog" aria-modal="true" aria-labelledby="auditClearTitle">
      <div id="auditClearTitle" class="audit-clear-title">Curăță Audit Log</div>
      <div class="audit-clear-copy">Această acțiune va șterge toate evenimentele existente din <strong>audit_log</strong>. Operațiunea este disponibilă doar pentru Admin și Superadmin și nu poate fi anulată.</div>
      <div id="auditClearStatus" class="audit-clear-status"></div>
      <div class="audit-clear-actions"><button type="button" id="auditClearCancel">Anulează</button><button type="button" id="auditClearConfirm" class="danger">Șterge toate evenimentele</button></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("open"); });
  modal.querySelector("#auditClearCancel").addEventListener("click", () => modal.classList.remove("open"));
  return modal;
}

async function getRole(user) {
  const db = getFirestore(getApp());
  const snap = await getDocs(collection(db, "utilizatori"));
  const mine = snap.docs.find(d => d.id === user.uid);
  const data = mine?.data() || {};
  return String(data.role || data.rol || "").toLowerCase();
}

async function clearAuditLog() {
  const modal = createModal();
  const status = modal.querySelector("#auditClearStatus");
  const confirm = modal.querySelector("#auditClearConfirm");
  confirm.disabled = true;
  status.className = "audit-clear-status";
  status.textContent = "Se șterg evenimentele…";
  try {
    const db = getFirestore(getApp());
    const snap = await getDocs(collection(db, "audit_log"));
    await Promise.all(snap.docs.map(item => deleteDoc(doc(db, "audit_log", item.id))));
    status.textContent = `Au fost șterse ${snap.size} evenimente.`;
    status.className = "audit-clear-status ok";
    setTimeout(() => window.location.reload(), 900);
  } catch (error) {
    console.error("Curățare Audit Log:", error);
    status.textContent = error?.code === "permission-denied"
      ? "Permisiunea de ștergere lipsește din Firestore Rules."
      : `Nu s-a putut curăța Audit Log: ${error?.message || "eroare necunoscută"}`;
    status.className = "audit-clear-status err";
    confirm.disabled = false;
  }
}

async function init() {
  if (!window.location.pathname.toLowerCase().endsWith("/audit.html") || !getApps().length) return;
  addStyles();
  const auth = getAuth(getApp());
  onAuthStateChanged(auth, async user => {
    if (!user) return;
    try {
      const role = await getRole(user);
      if (!ADMIN_ROLES.has(role)) return;
      const actions = document.querySelector(".actions");
      if (!actions || document.getElementById("auditClearButton")) return;
      const button = document.createElement("button");
      button.id = "auditClearButton";
      button.type = "button";
      button.className = "btn audit-clear-btn";
      button.textContent = "Curăță Audit Log";
      actions.appendChild(button);
      const modal = createModal();
      button.addEventListener("click", () => {
        modal.querySelector("#auditClearStatus").textContent = "";
        modal.querySelector("#auditClearConfirm").disabled = false;
        modal.classList.add("open");
      });
      modal.querySelector("#auditClearConfirm").addEventListener("click", clearAuditLog, { once: false });
    } catch (error) {
      console.error("Audit cleaner init:", error);
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
