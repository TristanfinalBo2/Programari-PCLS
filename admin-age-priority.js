import { db } from "./firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

if (!window.location.pathname.toLowerCase().endsWith("/admin.html")) {
  // Admin-only enhancement.
} else {
  const ageMap = new Map();
  let sortMode = localStorage.getItem("pcls_admin_request_sort") || "oldest";
  let refreshTimer = null;
  let observer = null;
  let rendering = false;

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
    if (!timestamp) return { minutes: 0, label: "Timp indisponibil", tone: "neutral" };
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    let label;
    if (hours >= 48) {
      const days = Math.floor(hours / 24);
      const rest = hours % 24;
      label = rest ? `${days}z ${rest}h` : `${days}z`;
    } else if (hours >= 24) {
      const rest = hours % 24;
      label = rest ? `${hours}h ${mins}m` : `${hours}h`;
    } else if (hours > 0) {
      label = `${hours}h ${mins}m`;
    } else {
      label = `${mins}m`;
    }

    const tone = hours >= 24 ? "critical" : hours >= 12 ? "warning" : "normal";
    return { minutes, label: `vechime ${label}`, tone };
  }

  function injectStyles() {
    if (document.getElementById("pcls-age-priority-style")) return;
    const style = document.createElement("style");
    style.id = "pcls-age-priority-style";
    style.textContent = `
      .pcls-age-sort-wrap{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 10px 0 12px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.025)}
      .pcls-age-sort-label{color:#8390a4;font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;white-space:nowrap}
      .pcls-age-sort-select{height:34px;border:1px solid rgba(124,231,255,.12);border-radius:9px;background:#0a1220;color:#eef5ff;padding:0 28px 0 10px;font:600 .72rem/1 inherit;outline:none;cursor:pointer}
      .pcls-age-sort-select:focus{border-color:rgba(124,231,255,.3);box-shadow:0 0 0 3px rgba(124,231,255,.05)}
      .pcls-request-age{display:inline-flex;align-items:center;justify-content:center;min-height:23px;padding:0 8px;border-radius:999px;border:1px solid rgba(255,255,255,.11);font-size:.61rem;font-weight:800;letter-spacing:.02em;white-space:nowrap;flex:0 0 auto}
      .pcls-request-age.normal{color:#f6f8fb;background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.12)}
      .pcls-request-age.warning{color:#ffe58c;background:rgba(255,193,7,.095);border-color:rgba(255,193,7,.23);box-shadow:0 0 16px rgba(255,193,7,.07)}
      .pcls-request-age.critical{color:#ffb7b2;background:rgba(255,77,69,.11);border-color:rgba(255,77,69,.28);box-shadow:0 0 18px rgba(255,77,69,.09)}
      .pcls-request-age.neutral{color:#9ba8ba;background:rgba(255,255,255,.04)}
      .card.pcls-age-critical{border-color:rgba(255,77,69,.18);box-shadow:0 0 0 1px rgba(255,77,69,.04),0 12px 30px rgba(0,0,0,.12)}
      .card.pcls-age-warning{border-color:rgba(255,193,7,.15)}
      .card .pcls-age-row{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:9px;min-height:24px}
      .card .pcls-created-label{color:#7d899d;font-size:.59rem;font-weight:700}
      @media(max-width:900px){.pcls-age-sort-wrap{width:100%;justify-content:space-between}.pcls-age-sort-select{flex:1;max-width:260px}.card .pcls-age-row{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function injectSortControl() {
    const controls = document.querySelector(".controls");
    if (!controls || document.getElementById("pcls-age-sort-wrap")) return;
    const wrap = document.createElement("div");
    wrap.id = "pcls-age-sort-wrap";
    wrap.className = "pcls-age-sort-wrap";
    wrap.innerHTML = `
      <span class="pcls-age-sort-label">Prioritate</span>
      <select id="pcls-age-sort-select" class="pcls-age-sort-select" aria-label="Ordine cereri">
        <option value="oldest">Cele mai vechi</option>
        <option value="newest">Cele mai noi</option>
      </select>`;
    controls.appendChild(wrap);

    const select = wrap.querySelector("#pcls-age-sort-select");
    select.value = sortMode;
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
        row.innerHTML = `<span class="pcls-created-label">Creată:</span><span class="pcls-request-age ${age.tone}">${age.label}</span>`;
      });
    } finally {
      rendering = false;
    }
  }

  function startObserver() {
    const host = document.getElementById("cereri-container");
    if (!host || observer) return;
    observer = new MutationObserver(() => {
      requestAnimationFrame(() => enhanceCards());
    });
    observer.observe(host, { childList: true });
  }

  function startAgeRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => enhanceCards(), 60000);
  }

  function start() {
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
