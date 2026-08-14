import { auth, db } from "./firebase-config.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const LABELS = { isuls: "ISULS", dsls: "DSLS", mmls: "MMLS", ssmls: "SSMLS" };
let selected = null;
let busy = false;
const val = (o, keys, fallback = "-") => { for (const k of keys) { const v = String(o?.[k] ?? "").trim(); if (v) return v; } return fallback; };
const dept = o => { const d = val(o, ["departament","department","dept"], "isuls").toLowerCase(); return LABELS[d] ? d : "isuls"; };
const dateFmt = v => { const x = String(v || "").trim(); if (!x) return "-"; if (/^\d{4}-\d{2}-\d{2}$/.test(x)) { const [y,m,d] = x.split("-"); return `${d}.${m}.${y}`; } return x.replace(/\//g,"."); };
function controlDate(o){ const d=val(o,["data_control","dataControl","dataProgramare","dataDorita"],""); if(d)return dateFmt(d); const x=val(o,["data_ora","dataOra"],""); return x.includes(" la ")?dateFmt(x.split(" la ")[0]):dateFmt(x); }
function controlTime(o){ const t=val(o,["ora_control","oraControl","oraProgramare","oraDorita","ora"],""); if(t)return t; const x=val(o,["data_ora","dataOra"],""); return x.includes(" la ")?x.split(" la ").slice(1).join(" la ").trim():"-"; }
function buildMessage(o){
  const d=dept(o);
  const business=val(o,["nume_afacere","unitate","denumire_afacere","business_name","nume_proprietar","proprietar","reprezentant","nume"]);
  const admin=val(o,["nume_administrator","numeAdministrator","administrator","admin","nume_proprietar","proprietar","reprezentant","nume"]);
  const phone=val(o,["telefon","telefon_contact","telefonContact","tel","phone"]);
  const location=val(o,["locatie","location","nr_locatie","numar_locatie","numarLocatie"]);
  const address=val(o,["adresa","adresa_control","adresaControl","strada","street"]);
  const extra=val(o,["informatii_extra","informatiiExtra","extra_info","detalii_extra","detalii","observatii","observații","descriere"]);
  return [
    `📋 **Programare ${LABELS[d]} / PCLS**`,
    `🏢 **Afacere:** ${business}`,
    `👤 **Administrator:** ${admin}`,
    `📞 **Telefon:** ${phone}`,
    `📅 **Data:** ${controlDate(o)}`,
    `🕐 **Ora:** ${controlTime(o)}`,
    `📍 **Locație:** ${location}`,
    `🏠 **Adresă:** ${address}`,
    `📝 **Extra:** ${extra}`
  ].join("\n");
}
async function load(id){ const s=await getDoc(doc(db,"cereri",id)); if(!s.exists())throw new Error("Cererea nu mai există."); return {id:s.id,...s.data()}; }
function styles(){ if(document.getElementById("approval-dispatch-style"))return; const s=document.createElement("style"); s.id="approval-dispatch-style"; s.textContent=`.approval-dispatch-preview{margin-top:18px;padding:0;border-radius:18px;border:0;background:transparent}.approval-dispatch-preview textarea{display:block;width:100%;min-height:260px;resize:vertical;padding:14px;border-radius:14px;border:1px solid rgba(88,166,255,.18);background:linear-gradient(145deg,rgba(13,28,48,.72),rgba(7,14,24,.52));color:#e7edf7;font:500 .75rem/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;box-sizing:border-box}.approval-dispatch-error{margin-top:10px;color:#ffd1d0;font-size:.7rem;font-weight:700}.approval-dispatch-ok{margin-top:10px;color:#caffec;font-size:.68rem;font-weight:700}`; document.head.appendChild(s); }
function ensurePreview(){ const summary=document.querySelector("#approve-modal .summary-card"); if(!summary)return null; summary.style.display="none"; let p=document.getElementById("approval-dispatch-preview"); if(p)return p; p=document.createElement("section"); p.id="approval-dispatch-preview"; p.className="approval-dispatch-preview"; p.innerHTML=`<textarea id="approval-dispatch-text" spellcheck="false" aria-label="Mesaj Discord"></textarea><div id="approval-dispatch-error" class="approval-dispatch-error"></div><div id="approval-dispatch-ok" class="approval-dispatch-ok"></div>`; summary.insertAdjacentElement("afterend",p); return p; }
async function send(o,content){ if(!auth.currentUser)throw new Error("Sesiunea a expirat. Reautentifică-te."); const token=await auth.currentUser.getIdToken(true); if(!token)throw new Error("Tokenul Firebase nu a putut fi obținut."); const r=await fetch("/api/discord-webhook",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({department:dept(o),content})}); const b=await r.json().catch(()=>null); if(!r.ok||!b?.ok)throw new Error(b?.error||`HTTP ${r.status}`); }
async function approve(o){ const admin=auth.currentUser; if(!admin)throw new Error("Sesiunea a expirat."); const snap=await getDoc(doc(db,"utilizatori",admin.uid)); const data=snap.exists()?snap.data()||{}:{}; const name=String(data.nume||data.name||data.displayName||admin.displayName||admin.email?.split("@")[0]||"Admin").trim(); await updateDoc(doc(db,"cereri",o.id),{status:"aprobat",procesat_de:`${name} (Aprobat cererea)`,data_procesare:new Date().toLocaleString("ro-RO"),deleted:false,discordDispatchSent:true,discordDispatchDepartment:dept(o)}); }
async function confirm(e){ if(busy||!selected?.id)return; e.preventDefault(); e.stopImmediatePropagation(); busy=true; const btn=document.getElementById("approve-ok-btn"), p=ensurePreview(), ta=p?.querySelector("#approval-dispatch-text"), er=p?.querySelector("#approval-dispatch-error"), ok=p?.querySelector("#approval-dispatch-ok"), original=btn?.innerHTML||"Confirmă & Acceptă"; if(btn){btn.disabled=true;btn.innerHTML="Se trimite…";} er&&(er.textContent=""); ok&&(ok.textContent=""); try{ const latest=await load(selected.id); const content=ta?.value?.trim()||buildMessage(latest); await send(latest,content); if(ok)ok.textContent="✓ Mesajul a fost trimis."; await approve(latest); setTimeout(()=>{document.getElementById("approve-modal")?.classList.remove("active");selected=null;},350); }catch(err){ console.error("Approval dispatch:",err); if(er)er.textContent=`Aprobarea NU a fost salvată. ${String(err?.message||err)}`; if(btn){btn.disabled=false;btn.innerHTML=original;} }finally{busy=false;} }
function bind(){ if(!location.pathname.toLowerCase().endsWith("/admin.html"))return; styles(); document.addEventListener("click",async e=>{const b=e.target.closest(".btn-approve"); if(!b)return; const id=b.getAttribute("data-id"); if(!id)return; try{selected=await load(id); const p=ensurePreview(); if(p){p.querySelector("#approval-dispatch-text").value=buildMessage(selected); p.querySelector("#approval-dispatch-error").textContent=""; p.querySelector("#approval-dispatch-ok").textContent="";}}catch(err){console.error("Approval preview:",err);}},true); document.addEventListener("click",e=>{if(e.target.closest("#approve-ok-btn"))void confirm(e)},true); document.addEventListener("click",e=>{if(e.target.closest("#approve-cancel-btn")||e.target.closest("#approve-close")){selected=null;busy=false;}},true); }
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
