const fs = require("fs");
const path = require("path");
let cachedHtml = null;

const notificationPatch = `
<style>
#pcls-notification-fix-host{display:flex;align-items:center;position:relative}
#pcls-notification-fix-host .notification-center-premium{position:relative}
#pcls-notification-fix-host .notification-item{cursor:default}
#pcls-notification-fix-host .notification-item.unread{background:linear-gradient(90deg,rgba(100,210,255,.09),transparent 75%)}
#pcls-notification-fix-host .notification-reason{margin-top:5px;color:#ffaaa5;font-size:.74rem;line-height:1.45}
</style>
<script>
(function(){
  const HOST='notification-section-premium';
  const BUTTON='pclsNotificationToggle';
  const DROP='pclsNotificationDropdown';
  const LIST='pclsNotificationList';
  const BADGE='pclsNotificationBadge';
  const MARK='pclsNotificationMarkAll';
  let discordId='';
  let current=[];
  let scheduled=false;

  const esc=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','\"':'&quot;'}[c]));
  const status=i=>{const s=String(i?.status||'').toLowerCase();if(s.includes('aprobat')||s.includes('accept'))return['approved','Cerere aprobată','a fost aprobată'];if(s.includes('respins')||s.includes('reject'))return['rejected','Cerere respinsă','a fost respinsă'];return null};
  const subject=i=>i?.nume_afacere||i?.numeAfacere||i?.unitate||i?.nume_proprietar||i?.proprietar||i?.nume||'cererea ta';
  const type=i=>i?.eveniment||i?.tip_cerere||i?.tipCerere||i?.tip||i?.departament||'Cerere';
  const signature=i=>[i?.id||'',i?.status||'',i?.createdAt||i?.data_procesare||i?.procesat_de||i?.actorName||''].join('|');
  const seenKey=()=>discordId?'pcls_notification_seen_'+discordId:null;
  const getSeen=()=>{try{return JSON.parse(localStorage.getItem(seenKey())||'{}')}catch{return{}}};
  const setSeen=v=>{try{localStorage.setItem(seenKey(),JSON.stringify(v))}catch{}};
  const fmt=i=>{const raw=i?.createdAt||i?.data_procesare||i?.updated_at||i?.created_at||i?.data_creare||i?.data;const d=new Date(raw||0);return !raw||Number.isNaN(d.getTime())?'Dată indisponibilă':new Intl.DateTimeFormat('ro-RO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)};

  function render(){
    const list=document.getElementById(LIST),badge=document.getElementById(BADGE),mark=document.getElementById(MARK); if(!list||!badge||!mark)return;
    const seen=getSeen(); const valid=current.filter(status); const unread=valid.filter(i=>i.read!==true&&seen[i.id]!==signature(i));
    badge.hidden=!unread.length; badge.textContent=unread.length>99?'99+':String(unread.length); mark.disabled=!unread.length;
    if(!valid.length){list.innerHTML='<div class="notification-empty">Nu ai încă răspunsuri procesate.</div>';return;}
    list.innerHTML=valid.slice(0,20).map(i=>{const s=status(i),u=i.read!==true&&seen[i.id]!==signature(i),icon=s[0]==='approved'?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m5 12 4 4L19 6"></path></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"></path></svg>';const reason=s[0]==='rejected'&&i.rejectionReason?'<div class="notification-reason">Motiv: '+esc(i.rejectionReason)+'</div>':'';const by=i.actorName||i.procesat_de||'PCLS';return '<article class="notification-item '+s[0]+(u?' unread':'')+'" data-pcls-id="'+esc(i.id)+'">'+(u?'<span class="notification-unread-dot"></span>':'')+'<div class="notification-icon">'+icon+'</div><div class="notification-copy"><strong>'+esc(s[1])+'</strong><p><b>'+esc(type(i))+'</b> pentru '+esc(subject(i))+' '+esc(s[2])+'.</p>'+reason+'<small>'+esc(fmt(i))+' · '+esc(by)+'</small></div><a class="notification-open" href="cererile_mele.html?cerere='+encodeURIComponent(i.requestId||i.id)+'" data-pcls-open="'+esc(i.id)+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg></a></article>'}).join('');
  }

  async function load(){
    try{const r=await fetch('/api/notifications-fast',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)return;current=Array.isArray(d.notifications)?d.notifications:[];render()}catch(e){console.error('PCLS notifications',e)}
  }

  async function boot(){
    try{const r=await fetch('/api/me',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok||!d.user?.discordId)return;discordId=String(d.user.discordId);const host=document.getElementById(HOST);if(!host)return;
      if(!document.getElementById(BUTTON)){
        host.innerHTML='<div id="pcls-notification-fix-host"><div class="notification-center-premium"><button class="notification-btn-premium" id="'+BUTTON+'" type="button" aria-label="Notificări" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg><span id="'+BADGE+'" class="notification-badge" hidden>0</span></button><div class="notification-dropdown-premium" id="'+DROP+'"><div class="notification-dropdown-head"><div><strong>Notificări</strong><span>Răspunsuri la cererile tale PCLS</span></div><button id="'+MARK+'" class="notification-mark-all" type="button">Marchează citite</button></div><div id="'+LIST+'" class="notification-list"><div class="notification-empty">Se încarcă notificările...</div></div><div class="notification-footer"><a href="cererile_mele.html">Vezi toate cererile</a></div></div></div></div>';
        const b=document.getElementById(BUTTON),drop=document.getElementById(DROP),mark=document.getElementById(MARK);
        b.addEventListener('click',e=>{e.stopPropagation();const open=drop.classList.toggle('show');b.classList.toggle('active',open);b.setAttribute('aria-expanded',String(open))});
        drop.addEventListener('click',e=>e.stopPropagation());
        mark.addEventListener('click',async()=>{const seen=getSeen();current.filter(status).forEach(i=>seen[i.id]=signature(i));setSeen(seen);await fetch('/api/notifications-fast',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'readAll'})}).catch(()=>{});render()});
        document.addEventListener('click',()=>{drop.classList.remove('show');b.classList.remove('active');b.setAttribute('aria-expanded','false')});
      }
      await load();
    }catch(e){console.error('PCLS notification boot',e)}
  }

  function ensure(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;boot()},80)}
  document.addEventListener('DOMContentLoaded',ensure,{once:true});
  window.addEventListener('pageshow',ensure);
  window.addEventListener('focus',ensure);
  const root=document.getElementById(HOST); if(root)new MutationObserver(()=>{if(!document.getElementById(BUTTON))ensure()}).observe(root,{childList:true});
})();
</script>`;

module.exports = function handler(req,res){
  try{
    if(!cachedHtml)cachedHtml=fs.readFileSync(path.join(process.cwd(),'index.html'),'utf8');
    const html=cachedHtml.replace('</body>',notificationPatch+'</body>');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).send(html);
  }catch(error){console.error('index-content error',error);return res.status(500).send('Eroare la încărcarea portalului.');}
};
