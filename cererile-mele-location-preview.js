import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const STYLE_ID = "pcls-my-request-location-preview-style";
const TECHNICAL_FIELDS = new Set([
  "locationimage",
  "locationimagename",
  "locationimageupdatedat",
  "locationimageurl",
  "locatieimagine",
  "location_photo",
  "rejectionreason",
  "motivrespingere",
  "motiv_respingere"
]);

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .pcls-my-location-card{grid-column:1/-1;padding:16px;border:1px solid rgba(124,231,255,.14);border-radius:18px;background:linear-gradient(145deg,rgba(124,231,255,.055),rgba(255,255,255,.025));overflow:hidden;margin-top:4px}
    .pcls-my-location-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
    .pcls-my-location-title{font-size:.78rem;font-weight:800;color:#eefbff}
    .pcls-my-location-badge{padding:5px 8px;border-radius:999px;color:#c8ffea;background:rgba(99,230,190,.07);border:1px solid rgba(99,230,190,.13);font-size:.6rem;font-weight:760}
    .pcls-my-location-image{display:block;width:100%;max-height:420px;object-fit:contain;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#050a12;cursor:zoom-in}
    .pcls-my-location-open{display:inline-block;margin-top:9px;color:#9ee9ff;font-weight:750;text-decoration:none;font-size:.68rem}
    .pcls-my-location-open:hover{text-decoration:underline}
    .pcls-my-location-empty{grid-column:1/-1;padding:13px 15px;border:1px dashed rgba(255,255,255,.09);border-radius:15px;color:#78869d;font-size:.68rem}
    .pcls-my-rejection-card{grid-column:1/-1;padding:16px;border:1px solid rgba(255,105,97,.22);border-radius:18px;background:linear-gradient(145deg,rgba(255,105,97,.075),rgba(255,255,255,.025));overflow:hidden;margin-top:4px}
    .pcls-my-rejection-title{font-size:.78rem;font-weight:820;color:#ffd9d6;margin-bottom:8px}
    .pcls-my-rejection-reason{color:#fff;line-height:1.55;font-size:.86rem;white-space:pre-wrap;word-break:break-word}
    .pcls-my-location-lightbox{position:fixed;inset:0;z-index:99999;display:none;place-items:center;padding:24px;background:rgba(2,5,11,.86);backdrop-filter:blur(18px)}
    .pcls-my-location-lightbox.show{display:grid}
    .pcls-my-location-lightbox img{max-width:min(1200px,96vw);max-height:90vh;object-fit:contain;border-radius:18px;box-shadow:0 35px 100px rgba(0,0,0,.6)}
    .pcls-my-location-lightbox button{position:absolute;top:18px;right:18px;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;font:inherit;font-size:1.3rem;cursor:pointer}
  `;
  document.head.appendChild(style);
}

function ensureLightbox() {
  if (document.getElementById("pcls-my-location-lightbox")) return;
  const box = document.createElement("div");
  box.id = "pcls-my-location-lightbox";
  box.className = "pcls-my-location-lightbox";
  box.innerHTML = `<button type="button" aria-label="Închide">×</button><img alt="Fotografie locație">`;
  document.body.appendChild(box);
  box.addEventListener("click", event => {
    if (event.target === box || event.target.tagName === "BUTTON") box.classList.remove("show");
  });
}

function cleanupTechnicalFields(details) {
  details?.querySelectorAll(":scope > .detail-item").forEach(item => {
    const label = String(item.querySelector(".detail-label")?.textContent || "")
      .trim().toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[ăâ]/g, "a")
      .replace(/î/g, "i")
      .replace(/ș/g, "s")
      .replace(/ț/g, "t");

    if (TECHNICAL_FIELDS.has(label)) item.remove();
  });
}

async function renderRequestMeta(requestId) {
  const details = document.getElementById("modal-details");
  if (!details || !requestId) return;

  details.querySelector(".pcls-my-location-card, .pcls-my-location-empty, .pcls-my-rejection-card")?.remove();
  cleanupTechnicalFields(details);

  try {
    const snap = await getDoc(doc(db, "cereri", requestId));
    const data = snap.exists() ? (snap.data() || {}) : {};
    const url = data.locationImage || data.locationImageUrl || data.locatieImagine || data.location_photo || "";
    const reason = String(data.rejectionReason || data.motivRespingere || data.motiv_respingere || "").trim();
    const status = String(data.status || "").toLowerCase();

    cleanupTechnicalFields(details);

    if (status.includes("respins") && reason) {
      const oldReason = details.querySelector(".pcls-my-rejection-card");
      oldReason?.remove();
      const card = document.createElement("section");
      card.className = "pcls-my-rejection-card";
      card.innerHTML = `
        <div class="pcls-my-rejection-title">❌ Motiv respingere:</div>
        <div class="pcls-my-rejection-reason"></div>
      `;
      card.querySelector(".pcls-my-rejection-reason").textContent = reason;
      details.insertBefore(card, details.firstChild);
    }

    if (!url) {
      const empty = document.createElement("div");
      empty.className = "pcls-my-location-empty";
      empty.textContent = "📍 Nu există o fotografie de locație atașată acestei cereri.";
      details.insertBefore(empty, details.firstChild);
      return;
    }

    const card = document.createElement("section");
    card.className = "pcls-my-location-card";
    card.innerHTML = `
      <div class="pcls-my-location-head">
        <div class="pcls-my-location-title">📍 Fotografie locație</div>
        <span class="pcls-my-location-badge">Atașată</span>
      </div>
      <img class="pcls-my-location-image" alt="Fotografie atașată a locației">
      <a class="pcls-my-location-open" href="#">Deschide fullscreen →</a>
    `;

    const image = card.querySelector("img");
    const open = card.querySelector("a");
    image.src = url;

    const showFullscreen = event => {
      event?.preventDefault();
      ensureLightbox();
      const box = document.getElementById("pcls-my-location-lightbox");
      box.querySelector("img").src = url;
      box.classList.add("show");
    };

    open.addEventListener("click", showFullscreen);
    image.addEventListener("click", showFullscreen);
    details.insertBefore(card, details.firstChild);
  } catch (error) {
    console.error("Cererile Mele location/rejection display:", error);
  }
}

function boot() {
  if (!location.pathname.toLowerCase().endsWith("/cererile_mele.html")) return;
  injectStyles();
  document.addEventListener("click", event => {
    const button = event.target.closest(".btn-details[data-request-id]");
    if (!button) return;
    const id = button.getAttribute("data-request-id");
    setTimeout(() => renderRequestMeta(id), 150);
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
