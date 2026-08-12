import { auth, db } from "./firebase-config.js";
import { collection, onSnapshot, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const requestBaseline = new Map();
const userBaseline = new Map();
let initialized = false;
let initializedUsers = false;
let running = false;

const norm = value => String(value || "").trim().toLowerCase();
const nameOf = d => String(d?.nume || d?.name || d?.displayName || d?.email || "Sistem").trim();
const roleOf = d => norm(d?.role || d?.rol);
const activeOf = d => d?.activ !== false && d?.active !== false && d?.enabled !== false;
const fingerprint = d => JSON.stringify({ status:norm(d?.status), archived:d?.arhivat===true || d?.archived===true, deleted:d?.deleted===true, processed:d?.procesat_de || "", active:activeOf(d), role:roleOf(d), name:nameOf(d) });

function hash(value) {
  let h=2166136261;
  for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}
  return (h>>>0).toString(16);
}

async function actor() {
  const u = auth.currentUser;
  if(!u) return {uid:"system", name:"Sistem", role:"system"};
  try { const s=await getDoc(doc(db,"utilizatori",u.uid)); const d=s.exists()?s.data():{}; return {uid:u.uid,name:nameOf({...d,email:u.email}),role:roleOf(d)||"user"}; }
  catch { return {uid:u.uid,name:u.email||"Utilizator",role:"user"}; }
}

async function writeAudit(key, data) {
  try { await setDoc(doc(db,"audit_log",key),{...data,createdAt:serverTimestamp()},{merge:false}); }
  catch(e){console.warn("Audit log nu a putut fi salvat:",e?.message||e);}
}

async function startRequests(){
  onSnapshot(collection(db,"cereri"), async snap=>{
    const a=await actor();
    for(const item of snap.docs){
      const data=item.data()||{}; const fp=fingerprint(data); const prev=requestBaseline.get(item.id);
      if(initialized && prev && prev!==fp){
        const old=JSON.parse(prev), current=JSON.parse(fp);
        let action="Cerere actualizată";
        if(old.status!==current.status) action=`Status cerere: ${current.status || "modificat"}`;
        else if(old.deleted!==current.deleted) action=current.deleted?"Cerere mutată în coș":"Cerere restaurată";
        else if(old.archived!==current.archived) action=current.archived?"Cerere arhivată":"Cerere dezarhivată";
        const key=`request_${item.id}_${hash(fp+String(Date.now()))}`;
        await writeAudit(key,{actorId:a.uid,actorName:a.name,actorRole:a.role,action,targetType:"cerere",targetId:item.id,targetName:data.nume_proprietar||data.proprietar||data.reprezentant||data.nume||"Cerere",status:current.status||"",department:data.departament||""});
      }
      requestBaseline.set(item.id,fp);
    }
    initialized=true;
  },e=>console.warn("Monitor audit cereri:",e?.message||e));
}

async function startUsers(){
  onSnapshot(collection(db,"utilizatori"), async snap=>{
    const a=await actor();
    for(const item of snap.docs){
      const data=item.data()||{}; const fp=fingerprint(data); const prev=userBaseline.get(item.id);
      if(initializedUsers && prev && prev!==fp && item.id!==a.uid){
        const old=JSON.parse(prev), current=JSON.parse(fp);
        let action="Cont utilizator actualizat";
        if(old.role!==current.role) action=`Role schimbat: ${old.role||"—"} → ${current.role||"—"}`;
        else if(old.active!==current.active) action=current.active?"Cont reactivat":"Cont dezactivat";
        else if(old.name!==current.name) action="Nume utilizator modificat";
        await writeAudit(`user_${item.id}_${hash(fp+String(Date.now()))}`,{actorId:a.uid,actorName:a.name,actorRole:a.role,action,targetType:"utilizator",targetId:item.id,targetName:nameOf(data),targetRole:roleOf(data),active:activeOf(data)});
      }
      userBaseline.set(item.id,fp);
    }
    initializedUsers=true;
  },e=>console.warn("Monitor audit utilizatori:",e?.message||e));
}

function init(){ if(running)return; running=true; startRequests(); startUsers(); }

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>{ if(document.getElementById("cereri-container")||location.pathname.toLowerCase().endsWith("admin.html")) init();},{once:true});
else if(document.getElementById("cereri-container")||location.pathname.toLowerCase().endsWith("admin.html")) init();
