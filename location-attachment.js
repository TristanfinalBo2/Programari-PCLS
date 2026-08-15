import { auth, db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  updateDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const STYLE_ID = "pcls-location-attachment-styles";
const pending = new Map();

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .pcls-location-attachment{grid-column:1/-1;margin-top:2px;padding:17px;border:1px solid rgba(124,231,255,.12);border-radius:20px;background:linear-gradient(145deg,rgba(124,231,255,.045),rgba(255,255,255,.025));box-shadow:inset 0 1px rgba(255,255,255,.045)}
    .pcls-location-attachment-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}.pcls-location-attachment-title{font-size:.85rem;font-weight:760;color:#f7fbff}.pcls-location-attachment-help{margin-top:4px;color:#8794a8;font-size:.7rem;line-height:1.45}.pcls-location-attachment-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;color:#a9edff;background:rgba(100,210,255,.07);border:1px solid rgba(100,210,255,.12);font-size:.62rem;font-weight:760;white-space:nowrap}.pcls-location-drop{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px;border:1px dashed rgba(124,231,255,.2);border-radius:16px;background:rgba(0,0,0,.12);cursor:pointer;transition:.2s ease}.pcls-location-drop:hover{border-color:rgba(124,231,255,.38);background:rgba(124,231,255,.045)}.pcls-location-drop strong{display:block;font-size:.78rem;color:#eaf8ff}.pcls-location-drop span{display:block;margin-top:4px;color:#79869a;font-size:.67rem}.pcls-location-input{display:none!important}.pcls-location-preview{display:none;align-items:center;gap:12px;margin-top:12px;padding:10px;border:1px solid rgba(99,230,190,.14);border-radius:15px;background:rgba(99,230,190,.045)}.pcls-location-preview.show{display:flex}.pcls-location-preview img{width:86px;height:64px;object-fit:cover;border-radius:11px;border:1px solid rgba(255,255,255,.09)}.pcls-location-preview-copy{min-width:0;flex:1}.pcls-location-preview-copy strong{display:block;color:#c8ffea;font-size:.74rem}.pcls-location-preview-copy span{display:block;margin-top:3px;color:#8391a3;font-size:.66rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pcls-location-remove{min-height:34px;padding:0 10px;border-radius:10px;border:1px solid rgba(255,105,97,.17);background:rgba(255,105,97,.055);color:#ffb9b5;font:inherit;font-size:.64rem;font-weight:740;cursor:pointer}.pcls-location-submit-note{display:none;margin-top:9px;color:#9ee9ff;font-size:.66rem}.pcls-location-submit-note.show{display:block}.pcls-location-paste-hint{margin-top:8px;color:#7f8da1;font-size:.63rem;line-height:1.4}@media(max-width:560px){.pcls-location-attachment-head{flex-direction:column}.pcls-location-badge{align-self:flex-start}.pcls-location-preview img{width:74px;height:56px}}
  `;
  document.head.appendChild(style);
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isMeaningful(value) {
  const text = normalize(value);
  return text.length >= 3 && !["-", "n/a", "fara", "fără", "obligatoriu"].includes(text);
}

function formSnapshot(form) {
  return Array.from(form.querySelectorAll("input[name], textarea[name], select[name]"))
    .filter(el => el.name && el.type !== "file" && el.name !== "location_image")
    .map(el => ({ name: el.name, value: String(el.value || "").trim() }))
    .filter(item => isMeaningful(item.value));
}

function flattenValues(obj, bucket = []) {
  if (!obj || typeof obj !== "object") return bucket;
  for (const value of Object.values(obj)) {
    if (typeof value === "string" || typeof value === "number") bucket.push(String(value));
    else if (value && typeof value === "object" && !value.toDate) flattenValues(value, bucket);
  }
  return bucket;
}

function createdMs(data) {
  const values = [data.createdAt, data.data_creare, data.created_at, data.updatedAt];
  for (const value of values) {
    try {
      if (value?.toDate) return value.toDate().getTime();
      const ms = new Date(value).getTime();
      if (Number.isFinite(ms)) return ms;
    } catch (_) {}
  }
  return 0;
}

function scoreCandidate(data, snapshot, startedAt) {
  const age = createdMs(data);
  if (age && (age < startedAt - 15000 || age > Date.now() + 10000)) return -1;

  const values = flattenValues(data).map(normalize).filter(Boolean);
  let score = 0;
  for (const field of snapshot) {
    const target = normalize(field.value);
    if (target.length < 3) continue;
    if (values.some(value => value === target)) score += target.length >= 7 ? 3 : 2;
    else if (values.some(value => value.includes(target) || target.includes(value))) score += 1;
  }
  if (age) score += 1;
  return score;
}

async function compressImage(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Selectează o imagine validă.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Imaginea trebuie să aibă maximum 8 MB.");

  const bitmap = await createImageBitmap(file);
  let width = bitmap.width;
  let height = bitmap.height;
  const maxSide = 1100;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let quality = 0.72;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > 620000 && quality > 0.42) {
    quality -= 0.07;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > 700000) {
    const small = document.createElement("canvas");
    const factor = 0.7;
    small.width = Math.max(1, Math.round(width * factor));
    small.height = Math.max(1, Math.round(height * factor));
    const smallCtx = small.getContext("2d", { alpha: false });
    smallCtx.fillStyle = "#ffffff";
    smallCtx.fillRect(0, 0, small.width, small.height);
    smallCtx.drawImage(canvas, 0, 0, small.width, small.height);
    dataUrl = small.toDataURL("image/jpeg", 0.58);
  }
  return dataUrl;
}

function uiForForm(form, index) {
  if (form.dataset.pclsLocationReady === "true") return;
  form.dataset.pclsLocationReady = "true";

  const wrapper = document.createElement("section");
  wrapper.className = "pcls-location-attachment";
  wrapper.innerHTML = `
    <div class="pcls-location-attachment-head">
      <div><div class="pcls-location-attachment-title">📍 Atașează o poză cu locația</div><div class="pcls-location-attachment-help">Fotografia va apărea ulterior în Detalii Cerere din Admin. JPG, PNG sau WEBP · maximum 8 MB.</div></div>
      <span class="pcls-location-attachment-badge">Opțional</span>
    </div>
    <label class="pcls-location-drop"><input class="pcls-location-input" type="file" accept="image/jpeg,image/png,image/webp"><div><strong>Selectează fotografia locației</strong><span>Click pentru fișier sau folosește Ctrl+V pentru a lipi o imagine.</span></div><span aria-hidden="true">＋</span></label>
    <div class="pcls-location-paste-hint">💡 Poți copia o imagine din Discord, Paint, browser sau capturi de ecran și să apeși <strong>Ctrl+V</strong> aici.</div>
    <div class="pcls-location-preview"><img alt="Preview locație"><div class="pcls-location-preview-copy"><strong>✓ Fotografie pregătită</strong><span></span></div><button type="button" class="pcls-location-remove">Elimină</button></div>
    <div class="pcls-location-submit-note">Fotografia este procesată și asociată automat cererii după trimitere.</div>
  `;

  const input = wrapper.querySelector(".pcls-location-input");
  const drop = wrapper.querySelector(".pcls-location-drop");
  const preview = wrapper.querySelector(".pcls-location-preview");
  const previewImage = wrapper.querySelector("img");
  const previewText = wrapper.querySelector(".pcls-location-preview-copy span");
  const remove = wrapper.querySelector(".pcls-location-remove");
  const note = wrapper.querySelector(".pcls-location-submit-note");

  let selectedFile = null;
  let selectedDataUrl = null;

  const setFile = async file => {
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      selectedFile = file;
      selectedDataUrl = dataUrl;

      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
      } catch (_) {
        // Browserele care nu permit programatic input.files vor folosi în continuare
        // selectedDataUrl pentru salvarea imaginii.
      }

      previewImage.src = selectedDataUrl;
      previewText.textContent = `${file.name || "Imagine lipită"} · ${Math.round(file.size / 1024)} KB original`;
      preview.classList.add("show");
      note.classList.add("show");
    } catch (error) {
      selectedFile = null;
      selectedDataUrl = null;
      input.value = "";
      console.error("PCLS location image:", error);
      alert(error.message || "Imaginea nu a putut fi procesată.");
    }
  };

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    await setFile(file);
  });

  // Ctrl+V: acceptă imagini lipite din clipboard în orice formular.
  form.addEventListener("paste", async event => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    await setFile(new File([file], `locatie-paste-${Date.now()}.${file.type.split("/")[1] || "png"}`, { type: file.type }));
  });

  // Permite și paste direct pe zona vizuală, chiar dacă focusul nu este pe input.
  drop.addEventListener("paste", async event => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    await setFile(new File([file], `locatie-paste-${Date.now()}.${file.type.split("/")[1] || "png"}`, { type: file.type }));
  });

  remove.addEventListener("click", () => {
    selectedFile = null;
    selectedDataUrl = null;
    input.value = "";
    preview.classList.remove("show");
    note.classList.remove("show");
  });

  form.addEventListener("submit", () => {
    if (!selectedDataUrl) return;
    pending.set(form, {
      image: selectedDataUrl,
      snapshot: formSnapshot(form),
      startedAt: Date.now(),
      fileName: selectedFile?.name || "locatie.jpg"
    });
    setTimeout(() => attachPending(form), 900);
  }, true);

  const submit = form.querySelector('button[type="submit"], input[type="submit"]');
  if (submit?.parentElement) submit.parentElement.insertAdjacentElement("beforebegin", wrapper);
  else form.appendChild(wrapper);
}

async function attachPending(form) {
  const payload = pending.get(form);
  if (!payload || !auth.currentUser) return;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const snapshot = await getDocs(collection(db, "cereri"));
      let best = null;
      let bestScore = 0;
      snapshot.docs.forEach(itemDoc => {
        const data = itemDoc.data() || {};
        if (data.locationImage) return;
        const score = scoreCandidate(data, payload.snapshot, payload.startedAt);
        if (score > bestScore) {
          bestScore = score;
          best = itemDoc;
        }
      });

      if (best && bestScore >= 5) {
        await updateDoc(doc(db, "cereri", best.id), {
          locationImage: payload.image,
          locationImageName: payload.fileName,
          locationImageUpdatedAt: new Date().toISOString()
        });
        pending.delete(form);
        return;
      }
    } catch (error) {
      console.error("PCLS location attachment:", error);
    }
    await new Promise(resolve => setTimeout(resolve, 900));
  }
}

function boot() {
  if (!document.body) return;
  if (/\/(admin|audit|auth|cererile_mele|notificari|setari)\.html$/i.test(location.pathname)) return;
  const forms = Array.from(document.querySelectorAll("form"));
  if (!forms.length) return;
  injectStyles();
  forms.forEach(uiForForm);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
