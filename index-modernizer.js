const STYLE_ID = "pcls-index-modernizer";
const HUB_ID = "pcls-command-hub";

const HUB_ITEMS = [
  { href: "pcls_page.html", icon: "↗", title: "Depune cerere", text: "Trimite rapid o programare PCLS.", tone: "blue" },
  { href: "inregistrare_page.html", icon: "+", title: "Înregistrează afacerea", text: "Adaugă o unitate în portal.", tone: "cyan" },
  { href: "cererile_mele.html", icon: "◷", title: "Cererile mele", text: "Vezi statusul și istoricul cererilor.", tone: "mint" },
  { href: "ghid_pcls.html", icon: "?", title: "Ghid PCLS", text: "Instrucțiuni și pașii de urmat.", tone: "violet" }
];

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.topbar-modern{background:linear-gradient(180deg,rgba(7,11,20,.90),rgba(7,11,20,.68)) !important;border-bottom:1px solid rgba(255,255,255,.14) !important;box-shadow:0 18px 60px rgba(0,0,0,.34),0 1px 0 rgba(100,210,255,.12) !important;}
.topbar-modern::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 18% 50%,rgba(100,210,255,.12),transparent 28%),radial-gradient(circle at 82% 50%,rgba(191,90,242,.10),transparent 26%);}
.topbar-container{min-height:88px !important;max-width:1500px !important;padding:14px 32px !important;gap:30px !important;}
.brand-logo-wrapper{width:52px !important;height:52px !important;border-radius:17px !important;border-color:rgba(100,210,255,.22) !important;background:linear-gradient(145deg,rgba(100,210,255,.16),rgba(255,255,255,.045)) !important;box-shadow:0 14px 34px rgba(0,0,0,.32),0 0 28px rgba(10,132,255,.10),inset 0 1px rgba(255,255,255,.18) !important;}
.brand-text strong{font-size:1.08rem !important;letter-spacing:-.025em !important;}
.brand-text span{color:#91a4bf !important;letter-spacing:.15em !important;font-size:.62rem !important;}
.nav-premium{padding:5px !important;gap:4px !important;background:rgba(255,255,255,.035) !important;border-color:rgba(255,255,255,.12) !important;box-shadow:0 10px 30px rgba(0,0,0,.20),inset 0 1px rgba(255,255,255,.07) !important;}
.nav-item{padding:11px 17px !important;font-size:.84rem !important;color:#c7d0df !important;}
.nav-item:hover,.nav-item:focus-visible{background:linear-gradient(180deg,rgba(255,255,255,.11),rgba(255,255,255,.055)) !important;box-shadow:0 8px 20px rgba(0,0,0,.18),inset 0 1px rgba(255,255,255,.10) !important;}
#admin-nav-container .nav-item{box-shadow:0 8px 24px rgba(10,132,255,.12),inset 0 1px rgba(255,255,255,.10) !important;}
.notification-btn-premium{width:48px !important;height:48px !important;background:linear-gradient(145deg,rgba(255,255,255,.12),rgba(255,255,255,.035)) !important;border-color:rgba(255,255,255,.15) !important;box-shadow:0 12px 32px rgba(0,0,0,.25),inset 0 1px rgba(255,255,255,.13) !important;}
.notification-btn-premium:hover,.notification-btn-premium.active{box-shadow:0 16px 38px rgba(0,0,0,.32),0 0 0 5px rgba(100,210,255,.06) !important;}
.portal-hero{min-height:calc(100vh - 88px) !important;padding-top:clamp(42px,6vw,78px) !important;padding-bottom:30px !important;}
.portal-hero .hero-actions{gap:10px !important;margin-top:28px !important;}
.portal-hero .hero-actions > *{min-height:48px !important;border-radius:15px !important;}
.hero-meta{margin-top:30px !important;gap:10px !important;}
.hero-meta div{min-height:94px !important;padding:16px !important;border-radius:18px !important;}
.hero-meta strong{font-size:1.42rem !important;}
#pcls-command-hub{position:relative;margin:0 auto 70px;width:min(1240px,calc(100% - 48px));}
.pcls-hub-shell{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:28px;padding:20px;background:linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.025)),rgba(11,17,29,.55);backdrop-filter:blur(26px) saturate(155%);-webkit-backdrop-filter:blur(26px) saturate(155%);box-shadow:0 24px 58px rgba(0,0,0,.26),inset 0 1px rgba(255,255,255,.09);}
.pcls-hub-shell::before{content:"";position:absolute;inset:-40% auto auto 42%;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(100,210,255,.13),transparent 68%);filter:blur(16px);pointer-events:none;}
.pcls-hub-head{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:end;gap:18px;margin-bottom:16px;}
.pcls-hub-kicker{color:#7f8aa0;font-size:.68rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase;}
.pcls-hub-title{margin-top:5px;color:#fff;font-size:1.22rem;font-weight:760;letter-spacing:-.035em;}
.pcls-hub-subtitle{max-width:460px;color:#9da9bb;font-size:.78rem;line-height:1.45;text-align:right;}
.pcls-hub-grid{position:relative;z-index:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}
.pcls-hub-card{position:relative;display:grid;grid-template-columns:42px minmax(0,1fr);gap:11px;align-items:center;min-height:92px;padding:13px;border:1px solid rgba(255,255,255,.08);border-radius:18px;color:#fff;background:rgba(255,255,255,.035);box-shadow:inset 0 1px rgba(255,255,255,.045);transition:transform .22s ease,border-color .22s ease,background .22s ease,box-shadow .22s ease;}
.pcls-hub-card:hover{transform:translateY(-4px);border-color:rgba(100,210,255,.24);background:rgba(255,255,255,.065);box-shadow:0 18px 34px rgba(0,0,0,.22),0 0 0 4px rgba(100,210,255,.035);}
.pcls-hub-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;color:#04121d;background:linear-gradient(145deg,#b6efff,#64d2ff);font-weight:900;font-size:1rem;box-shadow:0 10px 22px rgba(100,210,255,.16),inset 0 1px rgba(255,255,255,.6);}
.pcls-hub-card[data-tone="mint"] .pcls-hub-icon{background:linear-gradient(145deg,#caffec,#63e6be);}
.pcls-hub-card[data-tone="violet"] .pcls-hub-icon{background:linear-gradient(145deg,#ead8ff,#bf5af2);}
.pcls-hub-card[data-tone="cyan"] .pcls-hub-icon{background:linear-gradient(145deg,#d6f8ff,#7fe7ff);}
.pcls-hub-card strong{display:block;font-size:.84rem;font-weight:760;letter-spacing:-.02em;}
.pcls-hub-card span{display:block;margin-top:3px;color:#8f9caf;font-size:.68rem;line-height:1.35;}
#servicii{padding-top:0 !important;}
#servicii .section-heading{margin-bottom:20px !important;}
#servicii .section-heading h2{font-size:clamp(1.8rem,3vw,2.55rem) !important;}
#servicii .section-heading p{font-size:.86rem !important;}
.service-grid{gap:12px !important;margin-bottom:78px !important;}
.service-card{min-height:255px !important;padding:22px !important;border-radius:24px !important;grid-template-columns:92px minmax(0,1fr) !important;gap:18px !important;}
.service-icon{width:84px !important;height:84px !important;border-radius:20px !important;}
.service-icon img{width:64px !important;height:64px !important;}
.service-card h3{font-size:1.18rem !important;}
.service-card p{font-size:.84rem !important;}
.service-footer{padding-top:13px !important;font-size:.8rem !important;}
#proces{margin-bottom:54px !important;padding:30px !important;border-radius:28px !important;gap:24px !important;}
#proces h2{font-size:clamp(1.75rem,3vw,2.55rem) !important;}
.step-list{gap:10px !important;}
.step{min-height:135px !important;padding:15px !important;border-radius:18px !important;}
.step::before{width:40px;height:40px;border-radius:13px;font-size:.75rem;}
.step strong{font-size:.9rem !important;}
.step span{font-size:.78rem !important;}
.quick-actions{margin:0 auto 74px !important;gap:10px !important;}
.action-tile{min-height:145px !important;padding:18px !important;gap:13px !important;border-radius:20px !important;}
.tile-icon{width:44px !important;height:44px !important;border-radius:13px !important;}
.tile-copy strong{font-size:.92rem !important;}
.tile-copy span{font-size:.78rem !important;}
@media(max-width:900px){.topbar-container{grid-template-columns:1fr auto !important;padding:12px 18px !important}.nav-premium{display:none !important}.brand-text span{display:none !important}.pcls-hub-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.pcls-hub-head{align-items:flex-start;flex-direction:column;}.pcls-hub-subtitle{text-align:left;}}
@media(max-width:560px){.topbar-container{min-height:74px !important}.brand-logo-wrapper{width:44px !important;height:44px !important}.header-actions-premium{gap:7px !important}.notification-btn-premium{width:42px !important;height:42px !important}#pcls-command-hub{width:min(100% - 28px,1240px);margin-bottom:50px;}.pcls-hub-shell{padding:15px;border-radius:22px;}.pcls-hub-grid{grid-template-columns:1fr;}.pcls-hub-card{min-height:80px;}.hero-meta{margin-top:22px !important;}.hero-meta div{min-height:82px !important;}}
  `;
  document.head.appendChild(style);
}

function createHub() {
  if (document.getElementById(HUB_ID)) return;
  const hero = document.querySelector(".portal-hero");
  if (!hero) return;
  const section = document.createElement("section");
  section.id = HUB_ID;
  section.setAttribute("aria-label", "Command Hub");
  section.innerHTML = `<div class="pcls-hub-shell"><div class="pcls-hub-head"><div><div class="pcls-hub-kicker">Comandă rapidă</div><div class="pcls-hub-title">Centrul portalului</div></div><div class="pcls-hub-subtitle">Cele mai folosite acțiuni sunt acum grupate într-un singur loc.</div></div><div class="pcls-hub-grid">${HUB_ITEMS.map(item => `<a class="pcls-hub-card" data-tone="${item.tone}" href="${item.href}"><span class="pcls-hub-icon" aria-hidden="true">${item.icon}</span><span><strong>${item.title}</strong><span>${item.text}</span></span></a>`).join("")}</div></div>`;
  hero.insertAdjacentElement("afterend", section);
}

function refineExistingSections() {
  const serviceTitle = document.querySelector("#servicii .section-heading h2");
  const serviceDesc = document.querySelector("#servicii .section-heading p");
  if (serviceTitle) serviceTitle.textContent = "Servicii & departamente";
  if (serviceDesc) serviceDesc.textContent = "Accesează rapid zona de lucru potrivită pentru cererea ta.";
}

function init() {
  const isIndex = window.location.pathname === "/" || window.location.pathname.toLowerCase().endsWith("/index.html");
  if (!isIndex) return;
  ensureStyle();
  createHub();
  refineExistingSections();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
