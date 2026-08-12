function styleDepartmentPanel() {
  const host = document.getElementById("dash-departments");
  if (!host) return;

  const rows = [...host.querySelectorAll(".pcls-dash-row")];
  if (rows.length !== 4) return;

  const cards = rows.map(row => {
    const label = row.querySelector("span")?.textContent?.trim() || "Departament";
    const count = row.querySelector("strong")?.textContent?.trim() || "0";
    const width = row.querySelector(".pcls-bar i")?.style?.width || "0%";
    return { label, count, width };
  });

  host.classList.add("pcls-dept-polished");
  host.innerHTML = cards.map(item => `
    <div class="pcls-dept-polished-card">
      <div class="pcls-dept-polished-head">
        <span class="pcls-dept-polished-label">${item.label.toUpperCase()}</span>
        <strong>${item.count}</strong>
      </div>
      <div class="pcls-dept-polished-caption">${item.count === "1" ? "1 cerere" : `${item.count} cereri`}</div>
      <div class="pcls-dept-polished-track"><i style="width:${item.width}"></i></div>
    </div>
  `).join("");
}

function injectDepartmentStyles() {
  if (document.getElementById("pcls-dept-polish-style")) return;
  const style = document.createElement("style");
  style.id = "pcls-dept-polish-style";
  style.textContent = `
    #dash-departments.pcls-dept-polished {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .pcls-dept-polished-card {
      min-width: 0;
      padding: 15px;
      border-radius: 17px;
      border: 1px solid rgba(255,255,255,.075);
      background: linear-gradient(145deg, rgba(255,255,255,.035), rgba(255,255,255,.018));
      box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
    }
    .pcls-dept-polished-card:hover {
      transform: translateY(-1px);
      border-color: rgba(124,231,255,.15);
      background: linear-gradient(145deg, rgba(124,231,255,.045), rgba(255,255,255,.018));
    }
    .pcls-dept-polished-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .pcls-dept-polished-label {
      color: #aeb9ca;
      font-size: .66rem;
      font-weight: 800;
      letter-spacing: .1em;
    }
    .pcls-dept-polished-head strong {
      color: #f7f9ff;
      font-size: 1.25rem;
      font-weight: 800;
      line-height: 1;
    }
    .pcls-dept-polished-caption {
      margin-top: 6px;
      color: #7f8aa0;
      font-size: .62rem;
    }
    .pcls-dept-polished-track {
      height: 5px;
      margin-top: 12px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(255,255,255,.055);
    }
    .pcls-dept-polished-track i {
      display: block;
      height: 100%;
      min-width: 4px;
      border-radius: inherit;
      background: linear-gradient(90deg, #0a84ff, #64d2ff);
    }
    @media (max-width: 620px) {
      #dash-departments.pcls-dept-polished { grid-template-columns: 1fr; }
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
  const observer = new MutationObserver(() => {
    if (!target.classList.contains("pcls-dept-polished")) styleDepartmentPanel();
  });
  observer.observe(target, { childList: true, subtree: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
window.addEventListener("pageshow", init);
