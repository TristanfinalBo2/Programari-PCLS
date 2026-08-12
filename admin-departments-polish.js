function styleDepartmentPanel() {
  const host = document.getElementById("dash-departments");
  const panel = host?.closest?.(".pcls-dash-panel");
  if (!host || !panel) return;

  const rows = [...host.querySelectorAll(".pcls-dash-row")];
  if (rows.length !== 4) return;

  const cards = rows.map(row => ({
    label: row.querySelector("span")?.textContent?.trim() || "Departament",
    count: row.querySelector("strong")?.textContent?.trim() || "0",
    width: row.querySelector(".pcls-bar i")?.style?.width || "0%"
  }));

  host.classList.add("pcls-dept-grid");
  panel.classList.add("pcls-dept-panel-fixed");
  host.innerHTML = cards.map(item => `
    <article class="pcls-dept-card">
      <div class="pcls-dept-card-top">
        <div class="pcls-dept-name">${item.label.toUpperCase()}</div>
        <div class="pcls-dept-number">${item.count}</div>
      </div>
      <div class="pcls-dept-meta">${item.count === "1" ? "1 cerere" : `${item.count} cereri`}</div>
      <div class="pcls-dept-track"><i style="width:${item.width}"></i></div>
    </article>
  `).join("");
}

function injectDepartmentStyles() {
  if (document.getElementById("pcls-dept-polish-style")) return;
  const style = document.createElement("style");
  style.id = "pcls-dept-polish-style";
  style.textContent = `
    .pcls-dept-panel-fixed{
      min-height: 290px !important;
      box-sizing: border-box !important;
    }
    #dash-departments.pcls-dept-grid{
      display:grid !important;
      grid-template-columns:repeat(2,minmax(0,1fr)) !important;
      grid-auto-rows:minmax(105px,1fr);
      gap:10px !important;
      min-height:220px;
      align-content:stretch;
    }
    .pcls-dept-card{
      min-width:0;
      min-height:105px;
      padding:16px;
      border-radius:18px;
      border:1px solid rgba(255,255,255,.08);
      background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.018));
      box-shadow:inset 0 1px 0 rgba(255,255,255,.025);
      display:flex;
      flex-direction:column;
      justify-content:center;
      transition:transform .18s ease,border-color .18s ease,background .18s ease;
    }
    .pcls-dept-card:hover{
      transform:translateY(-2px);
      border-color:rgba(100,210,255,.18);
      background:linear-gradient(145deg,rgba(100,210,255,.055),rgba(255,255,255,.018));
    }
    .pcls-dept-card-top{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
    }
    .pcls-dept-name{
      color:#aeb9ca;
      font-size:.66rem;
      font-weight:800;
      letter-spacing:.11em;
    }
    .pcls-dept-number{
      color:#f7f9ff;
      font-size:1.35rem;
      line-height:1;
      font-weight:820;
      letter-spacing:-.04em;
    }
    .pcls-dept-meta{
      margin-top:5px;
      color:#7f8aa0;
      font-size:.64rem;
    }
    .pcls-dept-track{
      height:5px;
      margin-top:13px;
      overflow:hidden;
      border-radius:999px;
      background:rgba(255,255,255,.055);
    }
    .pcls-dept-track i{
      display:block;
      height:100%;
      min-width:4px;
      border-radius:inherit;
      background:linear-gradient(90deg,#0a84ff,#64d2ff);
    }
    @media(max-width:620px){
      .pcls-dept-panel-fixed{min-height:unset !important}
      #dash-departments.pcls-dept-grid{grid-template-columns:1fr !important;grid-auto-rows:auto;min-height:unset}
      .pcls-dept-card{min-height:96px}
    }
  `;
  document.head.appendChild(style);
}

function init() {
  injectDepartmentStyles();
  styleDepartmentPanel();
  const target = document.getElementById("dash-departments");
  if (!target || target.dataset.polishObserver === "true") return;
  target.dataset.polishObserver = "true";
  const observer = new MutationObserver(() => styleDepartmentPanel());
  observer.observe(target, { childList:true, subtree:true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
else init();
window.addEventListener("pageshow", init);
