import { db } from "./firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

if (window.location.pathname.toLowerCase().endsWith("/admin.html")) {
  const ageMap = new Map();
  let sortMode = localStorage.getItem("pcls_admin_request_sort") || "oldest";
  let refreshTimer = null;
  let observer = null;
  let rendering = false;
  let started = false;

  const parseTime = value => {
    if (!value) return 0;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (typeof value?.toDate === "function") return value.toDate().getTime();
    if (typeof value === "number") return value;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  };

  function createdTime(item) {
    return parseTime(
      item?.created_at ??
      item?.createdAt ??
      item?.createdAtTimestamp ??
      item?.data_creare ??
      item?.dataCreare ??
      item?.created ??
      item?.timestamp
    );
  }

  function ageData(timestamp) {
    if (!timestamp) {
      return { seconds: 0, label: "Timp indisponibil", tone: "neutral" };
    }

    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    let label;
    if (days > 0) {
      label = `${days}z ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
    } else if (hours > 0) {
      label = `${hours}h ${String(minutes).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
    } else {
      label = `${minutes}m ${String(secs).padStart(2, "0")}s`;
    }

    const tone = seconds >= 86400 ? "critical" : seconds >= 43200 ? "warning" : "normal";
    return { seconds, label, tone };
  }

  function injectStyles() {
    if (document.getElementById("pcls-age-priority-style")) return;

    const style = document.createElement("style");
    style.id = "pcls-age-priority-style";
    style.textContent = `
      .pcls-priority-toolbar{
        width:100%;
        margin:0 0 14px;
        padding:12px 14px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:14px;
        border:1px solid rgba(255,255,255,.08);
        border-radius:16px;
        background:linear-gradient(180deg,rgba(14,22,37,.72),rgba(8,14,25,.62));
        box-shadow:inset 0 1px rgba(255,255,255,.035),0 10px 24px rgba(0,0,0,.12);
      }
      .pcls-priority-copy{display:flex;align-items:center;gap:10px;min-width:0}
      .pcls-priority-icon{
        width:32px;height:32px;display:grid;place-items:center;flex:0 0 32px;
        border-radius:10px;color:#dceaff;background:rgba(76,141,255,.10);
        border:1px solid rgba(124,231,255,.12);font-size:.85rem;font-weight:800
      }
      .pcls-priority-title{font-size:.74rem;font-weight:800;color:#f5f8ff;letter-spacing:.01em}
      .pcls-priority-sub{margin-top:2px;font-size:.62rem;color:#77859b}
      .pcls-priority-controls{display:flex;align-items:center;gap:8px;flex:0 0 auto}
      .pcls-priority-select{
        height:36px;min-width:165px;padding:0 30px 0 12px;border-radius:10px;
        border:1px solid rgba(124,231,255,.14);background:#091221;color:#f1f6ff;
        font:600 .72rem/1 inherit;outline:none;cursor:pointer
      }
      .pcls-priority-select:focus{border-color:rgba(124,231,255,.32);box-shadow:0 0 0 3px rgba(124,231,255,.05)}
      .pcls-priority-live{
        display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 9px;border-radius:999px;
        color:#b9ffe7;background:rgba(104,242,192,.055);border:1px solid rgba(104,242,192,.13);
        font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em
      }
      .pcls-priority-live::before{content:"";width:6px;height:6px;border-radius:50%;background:#68f2c0;box-shadow:0 0 9px rgba(104,242,192,.75);animation:pclsLivePulse 1.4s ease-in-out infinite}
      @keyframes pclsLivePulse{50%{opacity:.38;transform:scale(.78)}}

      .pcls-request-age{
        display:inline-flex;align-items:center;justify-content:center;min-width:118px;
        min-height:26px;padding:0 9px;border-radius:9px;border:1px solid rgba(255,255,255,.10);
        font-size:.63rem;font-weight:800;letter-spacing:.015em;white-space:nowrap;font-variant-numeric:tabular-nums;
      }
      .pcls-request-age.normal{color:#f3f6fb;background:rgba(255,255,255,.035);border-color:rgba(255,255,255,.10)}
      .pcls-request-age.warning{color:#ffe58d;background:rgba(255,193,7,.08);border-color:rgba(255,193,7,.22);box-shadow:0 0 14px rgba(255,193,7,.055)}
      .pcls-request-age.critical{color:#ffb7b1;background:rgba(255,77,69,.09);border-color:rgba(255,77,69,.25);box-shadow:0 0 16px rgba(255,77,69,.07)}
      .pcls-request-age.neutral{color:#9aa7ba;background:rgba(255,255,255,.025)}
      .pcls-age-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.05)}
      .pcls-created-copy{display:flex;align-items:center;gap:6px;color:#77859b;font-size:.59rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em}
      .card.pcls-age-critical{border-color:rgba(255,77,69,.20);box-shadow:0 0 0 1px rgba(255,77,69,.035),0 12px 30px rgba(0,0,0,.12)}
      .card.pcls-age-warning{border-color:rgba(255,193,7,.16)}
      @media(max-width:820px){
        .pcls-priority-toolbar{align-items:flex-start;flex-direction:column}
        .pcls-priority-controls{width:100%}.pcls-priority-select{flex:1}
      }
      @media(max-width:560px){
        .pcls-priority-controls{flex-wrap:wrap}.pcls-priority-live{flex:1;justify-content:center}
        .pcls-age-row{align-items:flex-start;flex-direction:column}
      }
    `;
    document.head.appendChild(style);
  }

  function injectSortControl() {
    const controls = document.querySelector(".controls");
    if (!controls || document.getElementById("pcls-priority-toolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.id = "pcls-priority-toolbar";
    toolbar.className = "pcls-priority-toolbar";
    toolbar.innerHTML = `
      <div class="pcls-priority-copy">
        <span class="pcls-priority-icon">↕</span>
        <div>
          <div class="pcls-priority-title">Prioritate cereri</div>
          <div class="pcls-priority-sub">Vârsta este recalculată continuu și cererile se reordonează după selecție.</div>
        </div>
      </div>
      <div class="pcls-priority-controls">
        <select id="pcls-age-sort-select" class="pcls-priority-select" aria-label="Ordine cereri">
          <option value="oldest">Cele mai vechi</option>
          <option value="newest">Cele mai noi</option>
        </select>
        <span class="pcls-priority-live">LIVE</span>
      </div>`;

    controls.parentElement.insertBefore(toolbar, controls);

    const select = toolbar.querySelector("#pcls-age-sort-select");
    select.value = sortMode === "newest" ? "newest" : "oldest";
    select.addEventListener("change", () => {
      sortMode = select.value === "newest" ? "newest" : "oldest";
      localStorage.setItem("pcls_admin_request_sort", sortMode);
      enhanceCards();
    });
  }

  function reorderCards(cards) {
    const host = document.getElementById("cereri-container");
    if (!host || cards.length < 2) return;

    cards.sort((a, b) => {
      const ta = ageMap.get(a.dataset.id) || 0;
      const tb = ageMap.get(b.dataset.id) || 0;

      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;

      // implicit: cea mai veche / cea mai mare vechime prima.
      return sortMode === "newest" ? tb - ta : ta - tb;
    });

    const frag = document.createDocumentFragment();
    cards.forEach(card => frag.appendChild(card));
    host.appendChild(frag);
  }

  function enhanceCards() {
    const host = document.getElementById("cereri-container");
    if (!host || rendering) return;

    rendering = true;
    try {
      const cards = [...host.querySelectorAll(":scope > .card")];
      reorderCards(cards);

      cards.forEach(card => {
        const idSource = card.querySelector("[data-id]");
        const id = idSource?.getAttribute("data-id");
        if (!id) return;

        const timestamp = ageMap.get(id) || 0;
        const age = ageData(timestamp);

        card.classList.toggle("pcls-age-critical", age.tone === "critical");
        card.classList.toggle("pcls-age-warning", age.tone === "warning");

        let row = card.querySelector(".pcls-age-row");
        if (!row) {
          const body = card.querySelector(".card-body");
          if (!body) return;
          row = document.createElement("div");
          row.className = "pcls-age-row";
          body.appendChild(row);
        }

        row.innerHTML = `
          <span class="pcls-created-copy"><span aria-hidden="true">◷</span> Vechime cerere</span>
          <span class="pcls-request-age ${age.tone}">${age.label}</span>`;
      });
    } finally {
      rendering = false;
    }
  }

  function startObserver() {
    const host = document.getElementById("cereri-container");
    if (!host || observer) return;

    observer = new MutationObserver(() => {
      requestAnimationFrame(enhanceCards);
    });
    observer.observe(host, { childList: true });
  }

  function startAgeRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(enhanceCards, 1000);
  }

  function start() {
    if (started) return;
    started = true;

    injectStyles();
    injectSortControl();
    startObserver();
    startAgeRefresh();

    onSnapshot(collection(db, "cereri"), snapshot => {
      ageMap.clear();
      snapshot.docs.forEach(itemDoc => {
        ageMap.set(itemDoc.id, createdTime(itemDoc.data() || {}));
      });
      enhanceCards();
    }, error => console.error("Age priority monitor:", error));

    enhanceCards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
