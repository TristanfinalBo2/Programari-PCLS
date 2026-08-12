const STYLE_ID = "pcls-requests-skeleton-style";
const CONTAINER_ID = "cereri-container";
const ACTIVE_CLASS = "pcls-requests-skeleton-active";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${CONTAINER_ID}.${ACTIVE_CLASS}{position:relative;min-height:260px}
    #${CONTAINER_ID}.${ACTIVE_CLASS} > :not(.pcls-request-skeleton-wrap){visibility:hidden!important}
    .pcls-request-skeleton-wrap{display:grid;gap:10px;padding:4px 0 14px}
    .pcls-request-skeleton-card{position:relative;overflow:hidden;min-height:108px;padding:15px;border:1px solid rgba(255,255,255,.07);border-radius:16px;background:rgba(255,255,255,.025)}
    .pcls-request-skeleton-card::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.055),transparent);animation:pclsRequestShimmer 1.35s infinite}
    .pcls-request-skeleton-line{height:10px;border-radius:999px;background:rgba(255,255,255,.07);margin-bottom:10px;width:72%}
    .pcls-request-skeleton-line.short{width:42%}.pcls-request-skeleton-line.tiny{width:28%}.pcls-request-skeleton-line.bottom{width:55%;margin-bottom:0}
    @keyframes pclsRequestShimmer{100%{transform:translateX(100%)}}
    @media(prefers-reduced-motion:reduce){.pcls-request-skeleton-card::after{animation:none}}
  `;
  document.head.appendChild(style);
}

function createSkeleton() {
  const wrap = document.createElement("div");
  wrap.className = "pcls-request-skeleton-wrap";
  wrap.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 5; i++) {
    const card = document.createElement("div");
    card.className = "pcls-request-skeleton-card";
    card.innerHTML = `
      <div class="pcls-request-skeleton-line"></div>
      <div class="pcls-request-skeleton-line short"></div>
      <div class="pcls-request-skeleton-line tiny"></div>
      <div class="pcls-request-skeleton-line bottom"></div>`;
    wrap.appendChild(card);
  }
  return wrap;
}

function reveal(container, observer) {
  if (!container.classList.contains(ACTIVE_CLASS)) return;
  const skeleton = container.querySelector(":scope > .pcls-request-skeleton-wrap");
  if (skeleton) skeleton.remove();
  container.classList.remove(ACTIVE_CLASS);
  container.removeAttribute("data-pcls-skeleton");
  observer?.disconnect();
}

function hasRealContent(container) {
  const children = [...container.children];
  if (!children.length) return false;
  const real = children.filter(el => !el.classList.contains("pcls-request-skeleton-wrap"));
  if (!real.length) return false;
  return real.some(el => {
    const text = (el.textContent || "").trim();
    return text.length > 0 || el.querySelector("button,a,input,select,table,article,.card,.request-card");
  });
}

function boot() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container || container.dataset.pclsSkeletonBooted === "1") return;
  container.dataset.pclsSkeletonBooted = "1";
  injectStyles();
  container.classList.add(ACTIVE_CLASS);
  container.setAttribute("data-pcls-skeleton", "true");
  container.prepend(createSkeleton());

  let revealed = false;
  const observer = new MutationObserver(() => {
    if (revealed) return;
    if (hasRealContent(container)) {
      revealed = true;
      requestAnimationFrame(() => reveal(container, observer));
    }
  });
  observer.observe(container, { childList: true, subtree: true });

  // Fallback: never leave the page permanently hidden.
  setTimeout(() => {
    if (revealed) return;
    revealed = true;
    reveal(container, observer);
  }, 8000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
