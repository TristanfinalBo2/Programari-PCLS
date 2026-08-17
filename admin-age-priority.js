import { db } from "./firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

if (window.location.pathname.toLowerCase().endsWith("/admin.html")) {
  const ageMap = new Map();
  let sortMode = "oldest";
  let refreshTimer = null;
  let observer = null;
  let applying = false;

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

  function ageInfo(timestamp) {
    if (!timestamp) return { label: "—", tone: "neutral" };
    const totalSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const label = days > 0
      ? `${days}z ${String(hours).padStart(2,"0")}h ${String(minutes).padStart(2,"0")}m ${String(seconds).padStart(2,"0")}s`
      : `${String(hours).padStart(2,"0")}h ${String(minutes).padStart(2,"0")}m ${String(seconds).padStart(2,"0")}s`;

    const tone = totalSeconds >= 86400 ? "critical" : totalSeconds >= 43200 ? "warning" : "normal";
    return { label, tone };
  }

  function getCardId(card) {
    return card?.querySelector("[data-id]")?.getAttribute("data-id") || card?.dataset?.id || "";
  }

  function injectStyles() {
    if (document.getElementById("pcls-age-priority-style-v2")) return;
    const style = document.createElement("style");
    style.id = "pcls-age-priority-style-v2";
    style.textContent = `
      .pcls-age-sort-wrap{display:flex;align-items:center;gap:10px;width:100%;margin:0 0 14px;padding:10px 12px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:linear-gradient(180deg,rgba(12,19,32,.78),rgba(7,12,22,.72));box-shadow:inset 0 1px rgba(255,255,255,.04)}
      .pcls-age-sort-label{color:#8896ab;font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em;white-space:nowrap}
      .pcls-age-sort-select{min-width:190px;height:36px;padding:0 30px 0 11px;border:1px solid rgba(124,231,255,.15);border-radius:10px;background:#0b1423;color:#eef5ff;font:600 .75rem/1 inherit;outline:none;cursor:pointer}
      .pcls-age-live{margin-left:auto;display:inline-flex;align-items:center;gap:7px;color:#9fe9ff;font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.09em}
      .pcls-age-live::before{content:"";width:7px;height:7px;border-radius:50%;background:#68f2c0;box-shadow:0 0 12px rgba(104,242,192,.75);animation:pclsPulse 1.4s infinite}
      @keyframes pclsPulse{0%,100%{opacity:.45;transform:scale(.9)}50%{opacity:1;transform:scale(1)}}
      .pcls-age-row{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:9px;padding-top:9px;border-top:1px solid rgba(255,255,255,.05)}
      .pcls-created-label{color:#7d899d;font-size:.59rem;font-weight:700;letter-spacing:.03em}
      .pcls-request-age{display:inline-flex;align-items:center;justify-content:center;min-height:24px;padding:0 9px;border-radius:999px;border:1px solid rgba(255,255,255,.11);font-size:.61rem;font-weight:850;letter-spacing:.02em;white-space:nowrap;font-variant-numeric:tabular-nums}
      .pcls-request-age.normal{color:#f4f7fb;background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.12)}
      .pcls-request-age.warning{color:#ffe59a;background:rgba(255,193,7,.09);border-color:rgba(255,193,7,.25);box-shadow:0 0 16px rgba(255,193,7,.06)}
      .pcls-request-age.critical{color:#ffb9b4;background:rgba(255,77,69,.10);border-color:rgba(255,77,69,.30);box-shadow:0 0 18px rgba(255,77,69,.08)}
      .pcls-request-age.neutral{color:#a4b0c0;background:rgba(255,255,255,.04)}
      .card.pcls-age-critical{border-color:rgba(255,77,69,.20);box-shadow:0 0 0 1px rgba(255,77,69,.05),0 14px 34px rgba(0,0,0,.13)}
      .card.pcls-age-warning{border-color:rgba(255,193,7,.16)}
      @media(max-width:760px){.pcls-age-sort-wrap{flex-wrap:wrap}.pcls-age-sort-select{flex:1;min-width:180px}.pcls-age-live{margin-left:0}}
    `;
    document.head.appendChild(style);
  }

  function injectSortControl() {
    const controls = document.querySelector(".controls");
    if (!controls || document.getElementById("pcls-age-sort-wrap-v2")) return;
    const wrap = document.createElement("div");
    wrap.id = "pcls-age-sort-wrap-v2";
    wrap.className = "pcls-age-sort-wrap";
    wrap.innerHTML = `
      <span class="pcls-age-sort-label">Ordine cereri</span>
      <select id="pcls-age-sort-select-v2" class="pcls-age-sort-select" aria-label="Ordine cereri">
        <option value="oldest">Cele mai vechi — prioritate</option>
        <option value="newest">Cele mai noi</option>
      </select>
      <span class="pcls-age-live">LIVE</span>`;
    controls.parentElement?.insertBefore(wrap, controls);

    const select = wrap.querySelector("#pcls-age-sort-select-v2");
    sortMode = "oldest";
    select.value = sortMode;
    select.addEventListener("change", () => {
      sortMode = select.value === "newest" ? "newest" : "oldest";
      applyOrdering();
    });
  }

  function updateAgeBadges(cards) {
    for (const card of cards) {
      const id = getCardId(card);
      if (!id) continue;
      const age = ageInfo(ageMap.get(id) || 0);
      card.classList.toggle("pcls-age-critical", age.tone === "critical");
      card.classList.toggle("pcls-age-warning", age.tone === "warning");

      let row = card.querySelector(".pcls-age-row");
      if (!row) {
        const body = card.querySelector(".card-body");
        if (!body) continue;
        row = document.createElement("div");
        row.className = "pcls-age-row";
        body.appendChild(row);
      }
      row.innerHTML = `<span class="pcls-created-label">Vechime</span><span class="pcls-request-age ${age.tone}">${age.label}</span>`;
    }
  }

  function applyOrdering() {
    const host = document.getElementById("cereri-container");
    if (!host || applying) return;
    const cards = [...host.children].filter(el => el.classList?.contains("card"));
    if (!cards.length) return;

    applying = true;
    try {
      const decorated = cards.map((card, index) => ({
        card,
        id: getCardId(card),
        time: ageMap.get(getCardId(card)) || 0,
        index
      }));

      decorated.sort((a, b) => {
        if (a.time === b.time) return a.index - b.index;
        // Default: oldest first. Newest: newest first.
        return sortMode === "newest" ? b.time - a.time : a.time - b.time;
      });

      const frag = document.createDocumentFragment();
      decorated.forEach(({ card }) => frag.appendChild(card));
      host.appendChild(frag);

      updateAgeBadges(decorated.map(x => x.card));
    } finally {
      applying = false;
    }
  }

  function scheduleOrdering() {
    requestAnimationFrame(() => requestAnimationFrame(applyOrdering));
  }

  function startObserver() {
    const host = document.getElementById("cereri-container");
    if (!host || observer) return;
    observer = new MutationObserver(mutations => {
      if (applying) return;
      if (mutations.some(m => m.addedNodes.length || m.removedNodes.length)) scheduleOrdering();
    });
    observer.observe(host, { childList: true });

    document.querySelectorAll(".filter-btn, #cereri-search, #cereri-search-clear").forEach(el => {
      el.addEventListener("click", scheduleOrdering);
      el.addEventListener("input", scheduleOrdering);
    });
  }

  function startSecondRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      applyOrdering();
    }, 1000);
  }

  function start() {
    injectStyles();
    injectSortControl();
    startObserver();
    startSecondRefresh();

    onSnapshot(collection(db, "cereri"), snapshot => {
      ageMap.clear();
      snapshot.docs.forEach(itemDoc => {
        ageMap.set(itemDoc.id, createdTime(itemDoc.data() || {}));
      });
      scheduleOrdering();
    }, error => console.error("Age priority monitor:", error));

    scheduleOrdering();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
