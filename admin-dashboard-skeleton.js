function injectSkeletonStyles(){
  if(document.getElementById('pcls-skeleton-style')) return;
  const style=document.createElement('style');
  style.id='pcls-skeleton-style';
  style.textContent=`
    @keyframes pclsSkeletonShimmer{0%{background-position:-720px 0}100%{background-position:720px 0}}
    #pcls-admin-dashboard.pcls-loading .pcls-skeleton-cover{opacity:1;pointer-events:auto}
    .pcls-skeleton-cover{position:absolute;inset:0;z-index:50;padding:0;border-radius:20px;background:rgba(6,10,19,.78);backdrop-filter:blur(2px);opacity:0;pointer-events:none;transition:opacity .18s ease}
    .pcls-skeleton-wrap{display:grid;gap:14px;padding:0}
    .pcls-skeleton-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .pcls-skeleton-card,.pcls-skeleton-panel{border:1px solid rgba(255,255,255,.07);background:rgba(15,22,35,.76);border-radius:20px;overflow:hidden;position:relative}
    .pcls-skeleton-card{height:103px;padding:17px 18px}.pcls-skeleton-panel{height:320px;padding:18px}
    .pcls-skeleton-line{height:10px;border-radius:999px;background:linear-gradient(90deg,rgba(255,255,255,.045) 20%,rgba(255,255,255,.13) 45%,rgba(255,255,255,.045) 70%);background-size:720px 100%;animation:pclsSkeletonShimmer 1.45s linear infinite}
    .pcls-skeleton-line.sm{width:34%;height:8px}.pcls-skeleton-line.md{width:54%;margin-top:11px}.pcls-skeleton-line.lg{width:30%;height:24px;margin-top:12px}.pcls-skeleton-line.full{width:100%}.pcls-skeleton-line.wide{width:72%}
    .pcls-skeleton-panel-head{width:34%;height:13px;margin-bottom:20px}.pcls-skeleton-row{display:grid;grid-template-columns:70px 1fr 30px;gap:10px;align-items:center;margin:22px 0}.pcls-skeleton-activity{display:grid;gap:14px;margin-top:16px}.pcls-skeleton-activity-row{display:grid;grid-template-columns:30px 1fr 44px;gap:10px;align-items:center}.pcls-skeleton-dot{width:30px;height:30px;border-radius:10px}
    @media(max-width:1000px){.pcls-skeleton-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:560px){.pcls-skeleton-cards{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function skeletonMarkup(){
  return `<div class="pcls-skeleton-cover" aria-hidden="true"><div class="pcls-skeleton-wrap"><div class="pcls-skeleton-cards">${Array.from({length:4},()=>`<div class="pcls-skeleton-card"><div class="pcls-skeleton-line sm"></div><div class="pcls-skeleton-line lg"></div><div class="pcls-skeleton-line md"></div></div>`).join('')}</div><div style="display:grid;grid-template-columns:1.1fr .9fr;gap:12px"><div class="pcls-skeleton-panel"><div class="pcls-skeleton-line panel-head"></div>${Array.from({length:4},()=>`<div class="pcls-skeleton-row"><div class="pcls-skeleton-line"></div><div class="pcls-skeleton-line full"></div><div class="pcls-skeleton-line"></div></div>`).join('')}</div><div class="pcls-skeleton-panel"><div class="pcls-skeleton-line panel-head"></div><div class="pcls-skeleton-activity">${Array.from({length:5},()=>`<div class="pcls-skeleton-activity-row"><div class="pcls-skeleton-line pcls-skeleton-dot"></div><div><div class="pcls-skeleton-line wide"></div><div class="pcls-skeleton-line sm" style="margin-top:7px"></div></div><div class="pcls-skeleton-line sm"></div></div>`).join('')}</div></div></div></div></div>`;
}

function attach(){
  const dashboard=document.getElementById('pcls-admin-dashboard');
  if(!dashboard || dashboard.dataset.skeletonAttached==='1') return;
  dashboard.dataset.skeletonAttached='1';
  injectSkeletonStyles();
  if(getComputedStyle(dashboard).position==='static') dashboard.style.position='relative';
  dashboard.classList.add('pcls-loading');
  dashboard.insertAdjacentHTML('afterbegin',skeletonMarkup());

  const total=document.getElementById('dash-total');
  let started=false;
  const finish=()=>{
    if(started) return;
    started=true;
    dashboard.classList.remove('pcls-loading');
    const cover=dashboard.querySelector('.pcls-skeleton-cover');
    if(cover){cover.addEventListener('transitionend',()=>cover.remove(),{once:true});setTimeout(()=>cover.remove(),260);}
    observer.disconnect();
  };
  const observer=new MutationObserver(()=>{
    if(total && total.textContent.trim()!=='—') finish();
  });
  observer.observe(dashboard,{subtree:true,childList:true,characterData:true});
  if(total && total.textContent.trim()!=='—') finish();
  setTimeout(()=>{if(!started) finish();},8000);
}

const rootObserver=new MutationObserver(attach);
if(document.body) rootObserver.observe(document.body,{childList:true,subtree:true});
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',attach,{once:true}); else attach();
