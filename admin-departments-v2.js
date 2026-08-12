function findDepartmentHost() {
  return document.getElementById("dash-departments");
}

function styleDepartmentPanel() {
  const host = findDepartmentHost();
  const panel = host?.closest?.(".pcls-dash-panel");
  if (!host || !panel) return false;
  const rows = [...host.querySelectorAll(".pcls-dash-row")];
  if (rows.length !== 4) return false;
  const items = rows.map(row => ({
    name: row.querySelector("span")?.textContent?.trim()?.toUpperCase() || "DEPARTAMENT",
    count: row.querySelector("strong")?.textContent?.trim() || "0",
    width: row.querySelector(".pcls-bar i")?.style?.width || "0%"
  }));
  panel.classList.add("pcls-dept-v2-panel");
  host.className = "pcls-dept-v2-grid";
  host.innerHTML = items.map(item => `
    <article class="pcls-dept-v2-card">
      <div class="pcls-dept-v2-top">
        <div class="pcls-dept-v2-name">${item.name}</div>
        <div class="pcls-dept-v2-count">${item.count}</div>
      </div>
      <div class="pcls-dept-v2-label">${item.count === "1" ? "1 cerere" : `${item.count} cereri`}</div>
      <div class="pcls-dept-v2-track"><span style="width:${item.width}"></span></div>
    </article>
  `).join("");
  return true;
}

function injectStyles() {
  if (document.getElementById("pcls-dept-v2-style")) return;
  const style = document.createElement("style");
  style.id = "pcls-dept-v2-style";
  style.textContent = `
    .pcls-dept-v2-panel{min-height:276px !important;height:276px !important;padding:18px !important;box-sizing:border-box !important}
    .pcls-dept-v2-grid{display:grid !important;grid-template-columns:repeat(2,minmax(0,1fr)) !important;grid-template-rows:repeat(2,minmax(0,1fr)) !important;gap:12px !important;width:100% !important;height:220px !important;min-height:220px !important}
    .pcls-dept-v2-card{position:relative !important;min-width:0 !important;min-height:0 !important;padding:16px !important;border-radius:17px !important;border:1px solid rgba(255,255,255,.085) !important;background:linear-gradient(145deg,rgba(27,37,57,.88),rgba(11,17,30,.74)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 12px 25px rgba(0,0,0,.12) !important;overflow:hidden !important;display:flex !important;flex-direction:column !important;justify-content:center !important;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease !important}
    .pcls-dept-v2-card::after{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,rgba(10,132,255,.95),rgba(100,210,255,.25))}
    .pcls-dept-v2-card:hover{transform:translateY(-2px) !important;border-color:rgba(100,210,255,.22) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 16px 30px rgba(0,0,0,.18) !important}
    .pcls-dept-v2-top{display:flex !important;align-items:flex-start !important;justify-content:space-between !important;gap:12px !important}
    .pcls-dept-v2-name{color:#f6f8fc !important;font-size:.72rem !important;line-height:1.1 !important;font-weight:850 !important;letter-spacing:.11em !important}
    .pcls-dept-v2-count{color:#fff !important;font-size:1.65rem !important;font-weight:850 !important;line-height:.9 !important;letter-spacing:-.06em !important}
    .pcls-dept-v2-label{margin-top:11px !important;color:#aeb9ca !important;font-size:.66rem !important}
    .pcls-dept-v2-track{height:6px !important;margin-top:12px !important;border-radius:999px !important;background:rgba(255,255,255,.055) !important;overflow:hidden !important}
    .pcls-dept-v2-track span{display:block !important;height:100% !important;min-width:4px !important;border-radius:999px !important;background:linear-gradient(90deg,#0a84ff,#64d2ff) !important;box-shadow:0 0 13px rgba(100,210,255,.22) !important}
    @media(max-width:700px){.pcls-dept-v2-panel{height:auto !important;min-height:0 !important}.pcls-dept-v2-grid{grid-template-columns:1fr !important;grid-template-rows:repeat(4,94px) !important;height:auto !important;min-height:0 !important}}
  `;
  document.head.appendChild(style);
}

function boot() {
  injectStyles();
  if (styleDepartmentPanel()) return;
  const observer = new MutationObserver(() => {
    if (styleDepartmentPanel()) observer.disconnect();
  });
  observer.observe(document.body, { childList:true, subtree:true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once:true });
else boot();
window.addEventListener("pageshow", boot);
