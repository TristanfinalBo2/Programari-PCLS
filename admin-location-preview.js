import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const STYLE_ID = "pcls-admin-location-preview-style";

function styles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .pcls-location-detail-card{grid-column:1/-1;position:relative;padding:16px;border:1px solid rgba(124,231,255,.14);border-radius:18px;background:linear-gradient(145deg,rgba(124,231,255,.055),rgba(255,255,255,.025));overflow:hidden}.pcls-location-detail-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.pcls-location-detail-title{font-size:.78rem;font-weight:800;color:#eefbff}.pcls-location-detail-badge{padding:5px 8px;border-radius:999px;color:#c8ffea;background:rgba(99,230,190,.07);border:1px solid rgba(99,230,190,.13);font-size:.6rem;font-weight:760}.pcls-location-detail-image{display:block;width:100%;max-height:420px;object-fit:contain;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#050a12;cursor:zoom-in}.pcls-location-detail-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;color:#8190a4;font-size:.64rem}.pcls-location-detail-open{color:#9ee9ff;font-weight:750;text-decoration:none}.pcls-location-detail-open:hover{text-decoration:underline}.pcls-location-image-empty{grid-column:1/-1;padding:13px 15px;border:1px dashed rgba(255,255,255,.09);border-radius:15px;color:#78869d;font-size:.68rem}.pcls-image-lightbox{position:fixed;inset:0;z-index:99999;display:none;place-items:center;padding:24px;background:rgba(2,5,11,.86);backdrop-filter:blur(18px)}.pcls-image-lightbox.show{display:grid}.pcls-image-lightbox img{max-width:min(1200px,96vw);max-height:90vh;object-fit:contain;border-radius:18px;box-shadow:0 35px 100px rgba(0,0,0,.6)}.pcls-image-lightbox button{position:absolute;top:18px;right:18px;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;font:inherit;font-size:1.3rem;cursor:pointer}
  `;
  document.head.appendChild(style);
}

function ensureLightbox() {
  if (document.getElementById("pcls-location-lightbox")) return;
  const box = document.createElement("div");
  box.id = "pcls-location-lightbox";
  box.className = "pcls-image-lightbox";
  box.innerHTML = `<button type="button" aria-label="Închide">×</button><img alt="Imagine locație">`;
  document.body.appendChild(box);
  box.addEventListener("click", event => {
    if (event.target === box || event.target.tagName === "BUTTON") box.classList.remove("show");
  });
}

async function renderFor(id) {
  const container = document.getElementById("details-container");
  if (!container || !id) return;
  try {
    const snap = await getDoc(doc(db, "cereri", id));
    if (!snap.exists()) return;
    const data = snap.data() || {};
    const old = container.querySelector(".pcls-location-detail-card, .pcls-location-image-empty");
    old?.remove();
    const url = data.locationImage || data.locationImageUrl || data.locatieImagine || data.location_photo || "";
    if (!url) {
      const empty = document.createElement("div");
      empty.className = "pcls-location-image-empty";
      empty.textContent = "📍 Nu există o fotografie de locație atașată acestei cereri.";
      container.appendChild(empty);
      return;
    }

    const card = document.createElement("section");
    card.className = "pcls-location-detail-card";
    card.innerHTML = `
      <div class="pcls-location-detail-head"><div class="pcls-location-detail-title">📍 Fotografie locație</div><span class="pcls-location-detail-badge">Atașată</span></div>
      <img class="pcls-location-detail-image" alt="Fotografie atașată a locației">
      <div class="pcls-location-detail-meta"><span>${String(data.locationImageName || "Fotografie locație")}</span><a class="pcls-location-detail-open" href="#">Deschide fullscreen →</a></div>
    `;
    const image = card.querySelector("img");
    const open = card.querySelector("a");
    image.src = url;
    open.addEventListener("click", event => {
      event.preventDefault();
      ensureLightbox();
      const box = document.getElementById("pcls-location-lightbox");
      box.querySelector("img").src = url;
      box.classList.add("show");
    });
    image.addEventListener("click", () => open.click());
    container.appendChild(card);
  } catch (error) {
    console.error("PCLS location detail preview:", error);
  }
}

function boot() {
  if (!location.pathname.toLowerCase().endsWith("/admin.html")) return;
  styles();
  document.addEventListener("click", event => {
    const button = event.target.closest(".btn-details");
    if (!button) return;
    const id = button.getAttribute("data-id");
    setTimeout(() => renderFor(id), 180);
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
