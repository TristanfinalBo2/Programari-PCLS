import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, onSnapshot, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ROLE_ACCESS = ["admin", "superadmin"];
let currentRole = null;
let requests = [];
let users = [];
let auditEvents = [];
let started = false;
let unsubscribeRequests = null;
let unsubscribeUsers = null;
let unsubscribeAudit = null;

const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
const norm = value => String(value || "").trim().toLowerCase();
const deptOf = r => norm(r?.departament || r?.department || "necunoscut");

function activityIcon(event = {}) {
  const action = norm(event.action);
  if (action.includes("aprobat") || action.includes("reactivat")) return "✓";
  if (action.includes("respins") || action.includes("dezactivat") || action.includes("coș") || action.includes("ster") || action.includes("șters")) return "!";
  if (action.includes("role") || action.includes("nume") || action.includes("actualizat") || action.includes("modificat")) return "✦";
  if (action.includes("arhivat") || action.includes("restaurat")) return "↻";
  return "•";
}

function activityTone(event = {}) {
  const action = norm(event.action);
  if (action.includes("aprobat") || action.includes("reactivat")) return "success";
  if (action.includes("respins") || action.includes("dezactivat") || action.includes("ster") || action.includes("șters")) return "danger";
  if (action.includes("arhivat") || action.includes("restaurat")) return "warning";
  return "info";
}

function relativeTime(value) {
  const date = value?.toDate ? value.toDate() : new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "acum";
  const diff = Math.max(0, Date.now() - date.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "acum";
  if (mins < 60) return `acum ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `acum ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `acum ${days} zile`;
  return date.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit" });
}

function inject() {
  if (!document.getElementById("pcls-admin-dashboard-style")) {
    const style = document.createElement("style");
    style.id = "pcls-admin-dashboard-style";
    style.textContent = `
      #pcls-admin-dashboard{display:grid;gap:14px;margin:0 0 18px}
      .pcls-dash-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .pcls-dash-card{padding:17px 18px;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:linear-gradient(145deg,rgba(18,25,40,.63),rgba(10,15,27,.48));box-shadow:inset 0 1px rgba(255,255,255,.04),0 16px 38px rgba(0,0,0,.14)}
      .pcls-dash-label{color:#7f8aa0;font-size:.66rem;text-transform:uppercase;letter-spacing:.1em;font-weight:750}.pcls-dash-value{margin-top:6px;font-size:1.6rem;font-weight:780;color:#f7f9ff;letter-spacing:-.04em}.pcls-dash-sub{margin-top:5px;color:#aab5c7;font-size:.72rem}
      .pcls-dash-main{display:grid;grid-template-columns:1.1fr .9fr;gap:12px}
      .pcls-dash-panel{padding:18px;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:linear-gradient(145deg,rgba(18,25,40,.55),rgba(10,15,27,.4));overflow:hidden}.pcls-dash-panel h3{font-size:.88rem;font-weight:750;margin-bottom:14px}.pcls-dash-row{display:grid;grid-template-columns:80px 1fr 38px;gap:10px;align-items:center;margin:10px 0}.pcls-dash-row span{font-size:.7rem;color:#b8c0d0;text-transform:uppercase}.pcls-bar{height:7px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden}.pcls-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#0a84ff,#64d2ff);min-width:3px}.pcls-dash-row strong{font-size:.72rem;text-align:right;color:#f7f9ff}
      .pcls-activity-panel{min-height:230px;display:flex;flex-direction:column}
      .pcls-activity-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
      .pcls-activity-count{display:inline-flex;align-items:center;min-height:24px;padding:0 8px;border-radius:999px;background:rgba(124,231,255,.055);border:1px solid rgba(124,231,255,.11);color:#9ee9ff;font-size:.59rem;font-weight:750;text-transform:uppercase;letter-spacing:.07em}
      .pcls-audit-mini{display:grid;gap:7px;max-height:210px;overflow:auto;padding-right:4px}
      .pcls-audit-mini::-webkit-scrollbar{width:5px}.pcls-audit-mini::-webkit-scrollbar-thumb{background:rgba(255,255,255,.11);border-radius:999px}
      .pcls-audit-item{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.055)}.pcls-audit-item:last-child{border-bottom:0}
      .pcls-audit-icon{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;font-size:.72rem;font-weight:850;border:1px solid transparent}
      .pcls-audit-icon.info{color:#9ee9ff;background:rgba(100,210,255,.08);border-color:rgba(100,210,255,.12)}.pcls-audit-icon.success{color:#b8ffe7;background:rgba(99,230,190,.08);border-color:rgba(99,230,190,.12)}.pcls-audit-icon.warning{color:#ffe9a3;background:rgba(255,214,10,.07);border-color:rgba(255,214,10,.12)}.pcls-audit-icon.danger{color:#ffd1d0;background:rgba(255,105,97,.08);border-color:rgba(255,105,97,.12)}
      .pcls-audit-main{min-width:0}.pcls-audit-actor{font-size:.74rem;color:#f7f9ff;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pcls-audit-action{margin-top:2px;font-size:.68rem;color:#aeb9ca;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pcls-audit-target{font-size:.64rem;color:#7f8aa0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pcls-audit-time{font-size:.6rem;color:#7f8aa0;white-space:nowrap}
      .pcls-audit-empty{padding:24px 6px;text-align:center;color:#8894a8;font-size:.73rem;line-height:1.5}.pcls-audit-empty strong{display:block;color:#dfe8f5;font-size:.8rem;margin-bottom:4px}
      .pcls-audit-link{display:inline-flex;align-items:center;gap:5px;margin-top:auto;padding-top:12px;color:#9ee9ff;font-size:.7rem;font-weight:750;text-decoration:none}.pcls-audit-link:hover{text-decoration:underline}
      @media(max-width:1000px){.pcls-dash-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pcls-dash-main{grid-template-columns:1fr}}
      @media(max-width:560px){.pcls-dash-grid{grid-template-columns:1fr}.pcls-dash-row{grid-template-columns:70px 1fr 30px}.pcls-audit-item{grid-template-columns:30px minmax(0,1fr)}.pcls-audit-time{display:none}}
    `;
    document.head.appendChild(style);
  }

  if (!document.getElementById("pcls-admin-dashboard")) {
    const target = document.getElementById("cereri-container");
    if (!target?.parentElement) return;
    const dashboard = document.createElement("section");
    dashboard.id = "pcls-admin-dashboard";
    dashboard.innerHTML = `
      <div class="pcls-dash-grid">
        <div class="pcls-dash-card"><div class="pcls-dash-label">Total cereri</div><div id="dash-total" class="pcls-dash-value">—</div><div class="pcls-dash-sub">din toate departamentele</div></div>
        <div class="pcls-dash-card"><div class="pcls-dash-label">În așteptare</div><div id="dash-pending" class="pcls-dash-value">—</div><div class="pcls-dash-sub">neprocesate</div></div>
        <div class="pcls-dash-card"><div class="pcls-dash-label">Aprobate</div><div id="dash-approved" class="pcls-dash-value">—</div><div class="pcls-dash-sub">cereri finalizate cu succes</div></div>
        <div class="pcls-dash-card"><div class="pcls-dash-label">Respinse</div><div id="dash-rejected" class="pcls-dash-value">—</div><div class="pcls-dash-sub">cereri respinse</div></div>
      </div>
      <div class="pcls-dash-main">
        <div class="pcls-dash-panel"><h3>Cereri pe departamente</h3><div id="dash-departments"></div></div>
        <div class="pcls-dash-panel pcls-activity-panel">
          <div class="pcls-activity-head"><h3>Activitate recentă</h3><span id="dash-audit-count" class="pcls-activity-count">live</span></div>
          <div id="dash-audit-mini" class="pcls-audit-mini"><div class="pcls-audit-empty"><strong>Activitate recentă</strong>Se încarcă evenimentele administratorilor…</div></div>
          <a class="pcls-audit-link" href="audit.html">Deschide Audit Log <span>→</span></a>
        </div>
      </div>`;
    target.parentElement.insertBefore(dashboard, target);
  }
}

function render() {
  const total = requests.length;
  const pending = requests.filter(r => ["in_asteptare","în asteptare","în așteptare","pending"].includes(norm(r.status))).length;
  const approved = requests.filter(r => ["aprobat","aprobata","aprobată","acceptat","accepted"].includes(norm(r.status))).length;
  const rejected = requests.filter(r => ["respins","respinsa","respinsă","rejected"].includes(norm(r.status))).length;

  document.getElementById("dash-total")?.replaceChildren(document.createTextNode(String(total)));
  document.getElementById("dash-pending")?.replaceChildren(document.createTextNode(String(pending)));
  document.getElementById("dash-approved")?.replaceChildren(document.createTextNode(String(approved)));
  document.getElementById("dash-rejected")?.replaceChildren(document.createTextNode(String(rejected)));

  const deptCounts = {};
  for (const r of requests) {
    const dept = deptOf(r);
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  }

  const depts = ["isuls","dsls","mmls","ssmls"];
  const max = Math.max(1, ...depts.map(d => deptCounts[d] || 0));
  const deptHost = document.getElementById("dash-departments");
  if (deptHost) {
    deptHost.innerHTML = depts.map(d => `
      <div class="pcls-dash-row">
        <span>${d}</span>
        <div class="pcls-bar"><i style="width:${Math.round(((deptCounts[d] || 0) / max) * 100)}%"></i></div>
        <strong>${deptCounts[d] || 0}</strong>
      </div>
    `).join("");
  }

  const auditHost = document.getElementById("dash-audit-mini");
  const auditCount = document.getElementById("dash-audit-count");
  if (auditCount) auditCount.textContent = auditEvents.length ? `${Math.min(auditEvents.length, 5)} recente` : "live";

  if (auditHost) {
    if (!auditEvents.length) {
      auditHost.innerHTML = `<div class="pcls-audit-empty"><strong>Nu există încă activitate</strong>Acțiunile importante vor apărea aici automat după ce sunt înregistrate în Audit Log.</div>`;
    } else {
      auditHost.innerHTML = auditEvents.slice(0, 5).map(e => {
        const tone = activityTone(e);
        const icon = activityIcon(e);
        const actor = e.actorName || e.actorRole || "Sistem";
        const action = e.action || "Activitate înregistrată";
        const target = e.targetName || e.targetId || "Eveniment sistem";
        return `<div class="pcls-audit-item"><div class="pcls-audit-icon ${tone}">${esc(icon)}</div><div class="pcls-audit-main"><div class="pcls-audit-actor">${esc(actor)}</div><div class="pcls-audit-action">${esc(action)}</div><div class="pcls-audit-target">${esc(target)}</div></div><div class="pcls-audit-time">${esc(relativeTime(e.createdAt))}</div></div>`;
      }).join("");
    }
  }
}

function stopListeners() {
  unsubscribeRequests?.();
  unsubscribeUsers?.();
  unsubscribeAudit?.();
  unsubscribeRequests = null;
  unsubscribeUsers = null;
  unsubscribeAudit = null;
}

async function startForUser(user) {
  if (!user) return;
  if (!document.getElementById("cereri-container")) return;

  try {
    const snap = await getDoc(doc(db, "utilizatori", user.uid));
    const role = norm(snap.data()?.role || snap.data()?.rol);
    if (!ROLE_ACCESS.includes(role) && user.email !== "tsplayer18@gmail.com") return;

    currentRole = role;
    inject();
    stopListeners();

    unsubscribeRequests = onSnapshot(
      collection(db, "cereri"),
      snap => {
        requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        render();
      },
      err => console.error("Dashboard cereri:", err)
    );

    unsubscribeUsers = onSnapshot(
      collection(db, "utilizatori"),
      snap => {
        users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        render();
      },
      err => console.error("Dashboard utilizatori:", err)
    );

    unsubscribeAudit = onSnapshot(
      collection(db, "audit_log"),
      snap => {
        auditEvents = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
            const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
            return tb - ta;
          })
          .slice(0, 10);
        render();
      },
      err => {
        console.warn("Audit log indisponibil:", err);
        auditEvents = [];
        render();
      }
    );
  } catch (error) {
    console.error("Inițializare dashboard admin:", error);
  }
}

function initAuth() {
  if (started) return;
  started = true;

  onAuthStateChanged(auth, user => {
    if (!user) {
      stopListeners();
      return;
    }
    void startForUser(user);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuth, { once: true });
} else {
  initAuth();
}

window.addEventListener("pageshow", () => {
  if (auth.currentUser) void startForUser(auth.currentUser);
});
