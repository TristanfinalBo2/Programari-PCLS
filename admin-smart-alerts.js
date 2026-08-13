import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, getDocs, query, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function addStyles() {
  if (document.getElementById("smart-alerts-style")) return;
  const style = document.createElement("style");
  style.id = "smart-alerts-style";
  style.textContent = `
    .smart-alerts-panel{margin:0 0 18px;padding:18px 18px 14px;border:1px solid rgba(255,255,255,.09);border-radius:22px;background:linear-gradient(145deg,rgba(18,25,40,.62),rgba(10,15,27,.42));box-shadow:inset 0 1px rgba(255,255,255,.035)}
    .smart-alerts-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:13px}
    .smart-alerts-title{display:flex;align-items:center;gap:10px}.smart-alerts-title h3{font-size:.95rem;font-weight:800;color:#f7f9ff}.smart-alerts-title p{margin-top:3px;color:#7f8aa0;font-size:.68rem;line-height:1.45}
    .smart-alerts-pulse{width:8px;height:8px;border-radius:50%;background:#63e6be;box-shadow:0 0 12px rgba(99,230,190,.6);animation:smartPulse 1.8s ease-in-out infinite}
    @keyframes smartPulse{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.18)}}
    .smart-alerts-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
    .smart-alert{display:flex;align-items:flex-start;gap:10px;min-height:74px;padding:12px 13px;border-radius:16px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025)}
    .smart-alert.warn{border-color:rgba(255,214,10,.14);background:rgba(255,214,10,.035)}
    .smart-alert.danger{border-color:rgba(255,105,97,.16);background:rgba(255,105,97,.035)}
    .smart-alert.info{border-color:rgba(100,210,255,.14);background:rgba(100,210,255,.035)}
    .smart-alert.ok{border-color:rgba(99,230,190,.14);background:rgba(99,230,190,.035)}
    .smart-alert-icon{width:28px;height:28px;flex:0 0 28px;display:grid;place-items:center;border-radius:10px;background:rgba(255,255,255,.05);font-size:.84rem}
    .smart-alert-copy{min-width:0}.smart-alert-copy strong{display:block;font-size:.73rem;color:#f7f9ff}.smart-alert-copy span{display:block;margin-top:4px;color:#aeb7c8;font-size:.66rem;line-height:1.45}
    .smart-alert-count{margin-left:auto;flex:0 0 auto;min-width:23px;height:23px;padding:0 7px;display:grid;place-items:center;border-radius:999px;background:rgba(255,255,255,.07);color:#fff;font-size:.63rem;font-weight:800}
    .smart-alerts-empty{padding:10px 0 2px;color:#7f8aa0;font-size:.68rem}
    .smart-alerts-loading{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.smart-alert-skeleton{height:74px;border-radius:16px;background:linear-gradient(90deg,rgba(255,255,255,.025) 20%,rgba(255,255,255,.07) 40%,rgba(255,255,255,.025) 60%);background-size:200% 100%;animation:smartShimmer 1.4s linear infinite}@keyframes smartShimmer{to{background-position:-200% 0}}
    @media(max-width:900px){.smart-alerts-grid,.smart-alerts-loading{grid-template-columns:1fr 1fr}}
    @media(max-width:620px){.smart-alerts-panel{padding:15px}.smart-alerts-grid,.smart-alerts-loading{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function parseTime(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime() || 0;
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getStatus(data) {
  return String(data.status ?? data.stare ?? data.statusCerere ?? "").trim().toLowerCase();
}

function isPending(data) {
  const status = getStatus(data);
  return ["", "noua", "nou", "pending", "asteptare", "în așteptare", "in asteptare", "asteapta", "în verificare", "in verificare"].includes(status);
}

function requestTime(data) {
  return parseTime(data.createdAt ?? data.data_creare ?? data.dataCreare ?? data.created_at ?? data.timestamp ?? data.data ?? data.created);
}

function findMount() {
  const requests = document.getElementById("cereri-container");
  if (!requests) return null;
  return requests.parentElement || requests;
}

function ensurePanel() {
  let panel = document.getElementById("smart-alerts-panel");
  if (panel) return panel;
  const mount = findMount();
  if (!mount) return null;
  panel = document.createElement("section");
  panel.id = "smart-alerts-panel";
  panel.className = "smart-alerts-panel";
  panel.innerHTML = `
    <div class="smart-alerts-head">
      <div class="smart-alerts-title"><span class="smart-alerts-pulse"></span><div><h3>Smart Alerts</h3><p>Semnale importante calculate automat din activitatea portalului.</p></div></div>
      <span id="smart-alerts-updated" class="smart-alerts-count">LIVE</span>
    </div>
    <div id="smart-alerts-body" class="smart-alerts-loading"><div class="smart-alert-skeleton"></div><div class="smart-alert-skeleton"></div><div class="smart-alert-skeleton"></div></div>`;

  const firstChild = mount.firstElementChild;
  if (firstChild && firstChild.id !== "smart-alerts-panel") mount.insertBefore(panel, firstChild);
  else mount.prepend(panel);
  return panel;
}

function render(alerts) {
  const body = document.getElementById("smart-alerts-body");
  if (!body) return;
  if (!alerts.length) {
    body.innerHTML = `<div class="smart-alerts-empty">✓ Nu există situații care necesită atenție în acest moment.</div>`;
    return;
  }
  body.innerHTML = `<div class="smart-alerts-grid">${alerts.map(alert => `
    <div class="smart-alert ${alert.type}">
      <div class="smart-alert-icon">${alert.icon}</div>
      <div class="smart-alert-copy"><strong>${alert.title}</strong><span>${alert.text}</span></div>
      <span class="smart-alert-count">${alert.count}</span>
    </div>`).join("")}</div>`;
}

async function loadUnverifiedUsers() {
  const db = getFirestore(getApp());
  const snap = await getDocs(query(collection(db, "utilizatori"), limit(300)));
  let count = 0;
  for (const item of snap.docs) {
    const data = item.data() || {};
    const role = String(data.role || data.rol || "").toLowerCase();
    const hasRole = ["admin","superadmin","conducere","isuls","dsls","mmls","mm","ssmls","ssmmls"].includes(role);
    if (!hasRole) continue;
    const discordId = String(data.discordId || data.discord_id || "").trim();
    const verified = data.discordVerified === true;
    if (!/^\d{17,20}$/.test(discordId) || !verified) count++;
  }
  return count;
}

async function init() {
  if (!window.location.pathname.toLowerCase().endsWith("/admin.html")) return;
  if (!getApps().length) return;
  addStyles();
  const panel = ensurePanel();
  if (!panel) return;

  const db = getFirestore(getApp());
  let latestRequests = [];
  let unverifiedUsers = 0;

  const recompute = async () => {
    const now = Date.now();
    const pending = latestRequests.filter(isPending);
    const stalePending = pending.filter(item => {
      const t = requestTime(item);
      return t > 0 && now - t >= DAY_MS;
    });
    const recent = latestRequests.filter(item => {
      const t = requestTime(item);
      return t > 0 && now - t <= DAY_MS;
    });

    try { unverifiedUsers = await loadUnverifiedUsers(); } catch (error) { console.warn("Smart Alerts users:", error); }

    const alerts = [];
    if (stalePending.length) alerts.push({ type:"danger", icon:"⚠", title:"Cereri care așteaptă de peste 24h", text:"Există cereri care încă necesită procesare.", count:stalePending.length });
    if (pending.length) alerts.push({ type:"warn", icon:"⏳", title:"Cereri în așteptare", text:"Cereri care nu au fost încă finalizate.", count:pending.length });
    if (unverifiedUsers) alerts.push({ type:"info", icon:"●", title:"Conturi fără Discord verificat", text:"Aceste conturi necesită configurarea/verificarea Discord.", count:unverifiedUsers });
    if (!alerts.length && recent.length) alerts.push({ type:"ok", icon:"✓", title:"Totul este în regulă", text:"Nu există situații critice detectate în acest moment.", count:recent.length });
    render(alerts.slice(0,3));

    const stamp = document.getElementById("smart-alerts-updated");
    if (stamp) stamp.textContent = "LIVE · " + new Date().toLocaleTimeString("ro-RO", {hour:"2-digit", minute:"2-digit", second:"2-digit"});
  };

  onSnapshot(collection(db, "cereri"), snapshot => {
    latestRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    recompute();
  }, error => {
    console.error("Smart Alerts cereri:", error);
    render([{ type:"danger", icon:"!", title:"Nu pot încărca alertele", text:"Verifică conexiunea la Firestore și permisiunile contului.", count:"!" }]);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
