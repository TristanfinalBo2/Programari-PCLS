import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ICONS = {
  info: '<path d="M12 8h.01"></path><path d="M11 12h1v5h1"></path><circle cx="12" cy="12" r="9"></circle>',
  success: '<path d="m8 12 2.5 2.5L16 9"></path><circle cx="12" cy="12" r="9"></circle>',
  warning: '<path d="M12 8v4"></path><path d="M12 16h.01"></path><path d="m10.3 3.8-7 12.1A2 2 0 0 0 5 19h14a2 2 0 0 0 1.7-3.1l-7-12.1a2 2 0 0 0-3.4 0Z"></path>',
  error: '<circle cx="12" cy="12" r="9"></circle><path d="m9 9 6 6"></path><path d="m15 9-6 6"></path>'
};

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}
function toDate(value) {
  try {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch (_) { return null; }
}
function relativeTime(value) {
  const date = toDate(value);
  if (!date) return "acum";
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "acum";
  if (minutes < 60) return `acum ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `acum ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `acum ${days} zile`;
  return new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export async function createNotification({ recipientId, title, message, type = "info", requestId = null, requestUrl = null, status = null, actorName = null, actorRole = null } = {}) {
  const uid = String(recipientId || "").trim();
  if (!uid || !title || !message) return null;
  return addDoc(collection(db, "notificari"), {
    recipientId: uid,
    title: String(title),
    message: String(message),
    type: ["info", "success", "warning", "error"].includes(type) ? type : "info",
    requestId: requestId ? String(requestId) : null,
    requestUrl: requestUrl || (requestId ? `cererile_mele.html?cerere=${encodeURIComponent(requestId)}` : null),
    status: status ? String(status) : null,
    actorName: actorName ? String(actorName) : null,
    actorRole: actorRole ? String(actorRole) : null,
    read: false,
    createdAt: serverTimestamp()
  });
}
export function resolveRequestOwnerUid(item = {}) {
  const candidates = [item.ownerUid, item.ownerUID, item.firebaseUid, item.firebaseUID, item.userUid, item.userUID, item.uid, item.userId, item.user_id, item.utilizatorId, item.createdByUid, item.created_by_uid, item.submittedByUid, item.requesterUid, item.requesterId];
  return candidates.find(value => { const text = String(value || "").trim(); return text.length >= 20 && text !== "undefined" && text !== "null"; }) || null;
}
export async function notifyRequestStatus(item, newStatus, actorName = "Administrator") {
  const recipientId = resolveRequestOwnerUid(item);
  if (!recipientId) return null;
  const normalized = String(newStatus || "").toLowerCase();
  let type = "info", title = "Actualizare cerere", message = `Cererea ${item.id || "ta"} a fost actualizată.`;
  if (["aprobat", "acceptat", "approved"].includes(normalized)) { type = "success"; title = "Cerere aprobată"; message = "Cererea ta a fost aprobată. Deschide notificarea pentru detalii."; }
  else if (["respins", "respinsa", "rejected"].includes(normalized)) { type = "error"; title = "Cerere respinsă"; message = "Cererea ta a fost respinsă. Verifică detaliile și motivul afișat în cerere."; }
  else if (["in_cos", "cos"].includes(normalized)) { type = "warning"; title = "Cererea a fost mutată în Coș"; message = "Cererea ta a fost mutată în Coș de către un administrator."; }
  return createNotification({ recipientId, title, message, type, requestId: item.id || null, status: normalized, actorName });
}

function ensureNotificationStyles() {
  if (document.getElementById("notification-center-extra-styles")) return;
  const style = document.createElement("style");
  style.id = "notification-center-extra-styles";
  style.textContent = `
    .notification-btn-premium.has-new{animation:notification-pulse 1.9s ease-in-out infinite}
    @keyframes notification-pulse{0%,100%{box-shadow:0 10px 28px rgba(0,0,0,.2),inset 0 1px rgba(255,255,255,.1),0 0 0 0 rgba(100,210,255,.22)}50%{box-shadow:0 14px 34px rgba(0,0,0,.28),inset 0 1px rgba(255,255,255,.12),0 0 0 7px rgba(100,210,255,0)}}
    .notification-item.info .notification-icon{color:var(--accent);background:rgba(100,210,255,.09);border-color:rgba(100,210,255,.18)}
    .notification-item.warning .notification-icon{color:var(--gold);background:rgba(255,214,10,.09);border-color:rgba(255,214,10,.18)}
    .notification-item.error .notification-icon{color:var(--danger);background:rgba(255,105,97,.09);border-color:rgba(255,105,97,.18)}
    .notification-item.success .notification-icon{color:var(--mint);background:rgba(99,230,190,.09);border-color:rgba(99,230,190,.18)}
    .notification-item.warning .notification-unread-dot{background:var(--gold);box-shadow:0 0 10px rgba(255,214,10,.85)}
    .notification-item.error .notification-unread-dot{background:var(--danger);box-shadow:0 0 10px rgba(255,105,97,.85)}
    .notification-item.success .notification-unread-dot{background:var(--mint);box-shadow:0 0 10px rgba(99,230,190,.85)}
  `;
  document.head.appendChild(style);
}
function renderEmpty(){return '<div class="notification-empty">Nu ai notificări noi.<br><span style="opacity:.7">Centrul se actualizează automat.</span></div>';}
async function fetchServerNotifications(){
  try{
    const response=await fetch("/api/my-notifications",{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.ok||!Array.isArray(data.notifications))return null;
    return {items:data.notifications,user:data.user||null};
  }catch(error){console.warn("Server notification session unavailable:",error);return null;}
}
function sortItems(items){return [...items].sort((a,b)=>(toDate(b.createdAt)?.getTime()||0)-(toDate(a.createdAt)?.getTime()||0));}

function mountCenter(container){
  if(!container||container.dataset.notificationMounted==="true")return;
  container.dataset.notificationMounted="true";
  ensureNotificationStyles();
  container.innerHTML=`
    <div class="notification-center-premium">
      <button class="notification-btn-premium" id="notificationToggle" type="button" aria-label="Notificări" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg><span class="notification-badge" id="notificationBadge" hidden>0</span></button>
      <div class="notification-dropdown-premium" id="notificationDropdown" aria-hidden="true">
        <div class="notification-dropdown-head"><div><strong>Notificări</strong><span id="notificationSubtitle">Se sincronizează…</span></div><button class="notification-mark-all" id="notificationMarkAll" type="button" disabled>Marchează toate</button></div>
        <div class="notification-list" id="notificationList">${renderEmpty()}</div>
        <div class="notification-footer"><a href="notificari.html">Vezi toate notificările</a></div>
      </div>
    </div>`;
  const toggle=container.querySelector("#notificationToggle"),dropdown=container.querySelector("#notificationDropdown"),list=container.querySelector("#notificationList"),badge=container.querySelector("#notificationBadge"),subtitle=container.querySelector("#notificationSubtitle"),markAll=container.querySelector("#notificationMarkAll");
  let latestItems=[],firebaseUnsubscribe=null,serverMode=false,serverPoll=null;
  const close=()=>{dropdown.classList.remove("show");toggle.classList.remove("active");toggle.setAttribute("aria-expanded","false");dropdown.setAttribute("aria-hidden","true");};
  toggle.addEventListener("click",event=>{event.stopPropagation();const open=!dropdown.classList.contains("show");if(open){dropdown.classList.add("show");toggle.classList.add("active");toggle.classList.remove("has-new");toggle.setAttribute("aria-expanded","true");dropdown.setAttribute("aria-hidden","false");}else close();});
  document.addEventListener("click",event=>{if(!container.contains(event.target))close();});
  function render(items){
    latestItems=sortItems(items);
    const unread=latestItems.filter(item=>item.read!==true).length;
    badge.hidden=unread===0;badge.textContent=unread>99?"99+":String(unread);subtitle.textContent=unread?`${unread} necitite`:"Totul este citit";markAll.disabled=unread===0;
    if(!latestItems.length){list.innerHTML=renderEmpty();return;}
    list.innerHTML=latestItems.slice(0,6).map(item=>{
      const type=["info","success","warning","error"].includes(item.type)?item.type:"info";
      const url=item.requestUrl||(item.requestId?`cererile_mele.html?cerere=${encodeURIComponent(item.requestId)}`:"notificari.html");
      return `<article class="notification-item ${type} ${item.read===true?"":"unread"}" data-id="${escapeHtml(item.id)}" data-url="${escapeHtml(url)}">${item.read===true?"":'<span class="notification-unread-dot"></span>'}<div class="notification-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[type]}</svg></div><div class="notification-copy"><strong>${escapeHtml(item.title||"Notificare")}</strong><p>${escapeHtml(item.message||"")}</p><small>${escapeHtml(relativeTime(item.createdAt))}${item.actorName?` · ${escapeHtml(item.actorName)}`:""}</small></div><a class="notification-open" href="${escapeHtml(url)}" aria-label="Deschide notificarea"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"></path><path d="M7 7h10v10"></path></svg></a></article>`;
    }).join("");
    if(unread&&!dropdown.classList.contains("show"))toggle.classList.add("has-new");
  }
  async function markReadServer(id){try{await fetch("/api/my-notifications",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"read",id})});}catch(error){console.error("read server notification",error);}}
  async function markAllServer(){try{await fetch("/api/my-notifications",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"readAll"})});latestItems=latestItems.map(item=>({...item,read:true}));render(latestItems);}catch(error){console.error("mark all server notifications",error);}}
  list.addEventListener("click",async event=>{const item=event.target.closest(".notification-item"),link=event.target.closest("a.notification-open");if(!item)return;const id=item.dataset.id;if(id){if(serverMode)await markReadServer(id);else{try{await updateDoc(doc(db,"notificari",id),{read:true});}catch(error){console.error("read notification",error);}}const found=latestItems.find(x=>x.id===id);if(found)found.read=true;render(latestItems);}if(!link)window.location.href=item.dataset.url||"notificari.html";});
  markAll.addEventListener("click",async()=>{const unread=latestItems.filter(item=>item.read!==true);if(!unread.length)return;if(serverMode)await markAllServer();else{const batch=writeBatch(db);unread.forEach(item=>batch.update(doc(db,"notificari",item.id),{read:true}));try{await batch.commit();}catch(error){console.error("mark all notifications",error);}}});
  async function bootServerFallback(){const result=await fetchServerNotifications();if(!result){subtitle.textContent="Autentifică-te pentru notificări";return;}serverMode=true;render(result.items);clearInterval(serverPoll);serverPoll=setInterval(async()=>{if(document.visibilityState!=="visible")return;const latest=await fetchServerNotifications();if(latest)render(latest.items);},30000);}
  onAuthStateChanged(auth,async user=>{
    if(firebaseUnsubscribe){firebaseUnsubscribe();firebaseUnsubscribe=null;}
    clearInterval(serverPoll);serverMode=false;
    if(user){
      const q=query(collection(db,"notificari"),where("recipientId","==",user.uid));
      firebaseUnsubscribe=onSnapshot(q,snapshot=>render(snapshot.docs.map(item=>({id:item.id,...item.data()}))),error=>{console.error("notification center Firebase",error);bootServerFallback();});
      return;
    }
    // Discord authentication uses the HttpOnly cookie, not Firebase Auth.
    await bootServerFallback();
  });
}
function boot(){const container=document.getElementById("notification-section-premium");if(container)mountCenter(container);}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
