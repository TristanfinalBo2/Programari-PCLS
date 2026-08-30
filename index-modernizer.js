const STYLE_ID = "pcls-index-modernizer";
const ORDER_READY_ATTR = "data-pcls-home-order";

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
.cookie-user-profile{position:relative;}
@media(max-width:900px){.topbar-container{grid-template-columns:1fr auto !important;padding:12px 18px !important}.nav-premium{display:none !important}.brand-text span{display:none !important}}
@media(max-width:560px){.topbar-container{min-height:74px !important}.brand-logo-wrapper{width:44px !important;height:44px !important}.header-actions-premium{gap:7px !important}.notification-btn-premium{width:42px !important;height:42px !important}.hero-meta{margin-top:22px !important;}.hero-meta div{min-height:82px !important;}}
  `;
  document.head.appendChild(style);
}

function removeRedundantSections() {
  document.getElementById("servicii")?.remove();
  document.querySelector(".quick-actions")?.remove();
}

function reorderHomeSections() {
  const main = document.querySelector("main");
  if (!main || main.getAttribute(ORDER_READY_ATTR) === "1") return;
  const hero = document.querySelector(".portal-hero");
  const process = document.getElementById("proces");
  if (!hero || !process) return;
  [hero, process].forEach(section => main.appendChild(section));
  main.setAttribute(ORDER_READY_ATTR, "1");
}

function isAdminRole(role) {
  const normalized = String(role || "").trim().toLowerCase().replace(/\s+/g, "");
  return [
    "admin",
    "superadmin",
    "conducere",
    "conducerea",
    "isuls",
    "dsls",
    "mmls",
    "mmlls",
    "ssmls",
    "adminisuls",
    "admindsls",
    "adminmmls",
    "adminssmls"
  ].includes(normalized);
}

function renderAdminNav(user) {
  const container = document.getElementById("admin-nav-container");
  if (!container) return;

  // Never clear an Admin link that was already established by the main
  // Firebase auth renderer. The old behavior caused the link to appear and
  // then disappear when the cookie session probe returned without a role.
  if (!isAdminRole(user?.role)) return;

  const alreadyPresent = container.querySelector('a[href="admin.html"]');
  if (alreadyPresent) return;

  const link = document.createElement("a");
  link.href = "admin.html";
  link.className = "nav-item";
  link.textContent = "Cereri Admin";
  container.appendChild(link);
}

function renderCookieUser(user) {
  const authContainer = document.getElementById("auth-section-premium") || document.getElementById("auth-links");
  if (!authContainer) return;
  const name = String(user?.name || "Utilizator Discord").trim();
  const initial = (name.charAt(0) || "U").toUpperCase();

  renderAdminNav(user);

  authContainer.innerHTML = `
    <div class="user-profile-premium">
      <button class="profile-btn-premium" id="profileToggle" type="button">
        <span>Salut, ${escapeHtml(name)}</span>
        <div class="profile-avatar">${escapeHtml(initial)}</div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <div class="profile-dropdown-premium" id="profileDropdown">
        <div class="dropdown-user-info"><span>Conectat</span><strong>${escapeHtml(name)}</strong></div>
        <div class="dropdown-divider"></div>
        <a href="cererile_mele.html" class="dropdown-item-premium">Cererile Mele</a>
        <a href="setari.html" class="dropdown-item-premium">Setări cont</a>
        <div class="dropdown-divider"></div>
        <button id="btnLogout" class="dropdown-item-premium" style="color:#ff6b6b;background:none;border:none;width:100%;text-align:left;cursor:pointer;">Deconectare</button>
      </div>
    </div>`;

  const profileToggle = document.getElementById("profileToggle");
  const profileDropdown = document.getElementById("profileDropdown");
  if (profileToggle && profileDropdown) {
    profileToggle.onclick = event => {
      event.stopPropagation();
      profileDropdown.classList.toggle("show");
    };
    if (!window.__pclsProfileClickBound) {
      window.__pclsProfileClickBound = true;
      document.addEventListener("click", event => {
        const t = document.getElementById("profileToggle");
        const d = document.getElementById("profileDropdown");
        if (t && d && !t.contains(event.target) && !d.contains(event.target)) d.classList.remove("show");
      });
    }
  }

  document.getElementById("btnLogout")?.addEventListener("click", async () => {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
    } finally {
      window.location.href = "auth.html";
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"
  })[char]);
}

async function initCookieAuth() {
  const isIndex = window.location.pathname === "/" || window.location.pathname.toLowerCase().endsWith("/index.html");
  if (!isIndex) return;
  try {
    const response = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    if (data.ok && data.user) renderCookieUser(data.user);
  } catch (error) {
    console.error("Cookie Discord auth:", error);
  }
}

function init() {
  const isIndex = window.location.pathname === "/" || window.location.pathname.toLowerCase().endsWith("/index.html");
  if (!isIndex) return;
  ensureStyle();
  document.getElementById("pcls-command-hub")?.remove();
  removeRedundantSections();
  reorderHomeSections();
  setTimeout(initCookieAuth, 500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();