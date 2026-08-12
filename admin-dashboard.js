import { auth, db } from "./firebase-config.js";
import { collection, onSnapshot, getDoc, doc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ROLE_ACCESS = ["admin", "superadmin"];
let currentRole = null;
let requests = [];
let users = [];
let auditEvents = [];
let requestsReady = false;
let usersReady = false;
let eventsReady = false;

const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
const norm = value => String(value || "").trim().toLowerCase();
const activeOf = u => u?.activ !== false && u?.active !== false && u?.enabled !== false;
const deptOf = r => norm(r?.departament || "necunoscut");

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
      .pcls-dash-panel{padding:18px;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:linear-gradient(145deg,rgba(18,25,40,.55),rgba(10,15,27,.4));overflow:hidden}.pcls-dash-panel h3{font-size:.88rem;font-weight:750;margin-bottom:14px}.pcls-dash-row{display:grid;grid-template-columns:80px 1fr 38px;gap:10px;align-items:center;margin:10px 0}.pcls-dash-row span{font-size:.7rem;color:#b8c0d0;text-transform:uppercase}.pcls-bar{height:7px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden}.pcls-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#0a84ff,#64d2ff);min-width:3px}.pcls-dash-row strong{font-size:.72rem;text-align:right;color:#f7f9ff}.pcls-audit-mini{display:grid;gap:8px;max-height:180px;overflow:auto}.pcls-audit-item{display:grid;grid-template-columns:64px 1fr;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.055)}.pcls-audit-item:last-child{border-bottom:0}.pcls-audit-time{color:#7f8aa0;font-size:.65rem}.pcls-audit-text{font-size:.72rem;color:#b8c0d0;line-height:1.45}.pcls-audit-text b{color:#f7f9ff}.pcls-audit-link{display:inline-flex;margin-top:10px;color:#9ee9ff;font-size:.71rem;font-weight:700}
      @media(max-width:1000px){.pcls-dash-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pcls-dash-main{grid-template-columns:1fr}}
      @media(max-width:560px){.pcls-dash-grid{grid-template-columns:1fr}.pcls-dash-row{grid-template-columns:70px 1fr 30px}}
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
        <div class="pcls-dash-panel"><h3>Activitate recentă</h3><div id="dash-audit-mini" class="pcls-audit-mini"><div class="pcls-audit-text">Se încarcă activitatea…</div></div><a class="pcls-audit-link" href="audit.html">Deschide Audit Log →</a></div>
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
  for (const r of requests) deptCounts[deptOf(r)] = (deptCounts[deptOf(r)] || 0) + 1;
  const depts = ["isuls","dsls","mmls","ssmls"];
  const max = Math.max(1, ...depts.map(d => deptCounts[d] || 0));
  const deptHost = document.getElementById("dash-departments");
  if (deptHost) deptHost.innerHTML = depts.map(d => `<div class="pcls-dash-row"><span>${d}</span><div class="pcls-bar"><i style="width:${Math.round(((deptCounts[d]||0)/max)*100)}%"></i></div><strong>${deptCounts[d]||0}</strong></div>`).join("");

  const auditHost = document.getElementById("dash-audit-mini");
  if (auditHost) {
    if (!auditEvents.length) auditHost.innerHTML = `<div class="pcls-audit-text">Nu există încă evenimente de audit.</div>`;
    else auditHost.innerHTML = auditEvents.slice(0,5).map(e => {
      const date = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0);
      const time = Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("ro-RO",{hour:"2-digit",minute:"2-digit"});
      return `<div class="pcls-audit-item"><div class="pcls-audit-time">${esc(time)}</div><div class="pcls-audit-text"><b>${esc(e.actorName || e.actorRole || "Sistem")}</b> · ${esc(e.action || "Activitate")}</div></div>`;
    }).join("");
  }
}

async function init() {
  const user = auth.currentUser;
  if (!user) return;
  const snap = await getDoc(doc(db,"utilizatori",user.uid));
  const role = norm(snap.data()?.role || snap.data()?.rol);
  if (!ROLE_ACCESS.includes(role) && user.email !== "tsplayer18@gmail.com") return;
  currentRole = role;
  inject();

  onSnapshot(collection(db,"cereri"), snap => { requests = snap.docs.map(d=>({id:d.id,...d.data()})); requestsReady = true; render(); }, err=>console.error("Dashboard cereri:",err));
  onSnapshot(collection(db,"utilizatori"), snap => { users = snap.docs.map(d=>({uid:d.id,...d.data()})); usersReady = true; render(); }, err=>console.error("Dashboard utilizatori:",err));
  onSnapshot(query(collection(db,"audit_log"),orderBy("createdAt","desc"),limit(10)), snap => { auditEvents = snap.docs.map(d=>({id:d.id,...d.data()})); eventsReady = true; render(); }, err => console.warn("Audit log indisponibil:",err));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true});
else init();
