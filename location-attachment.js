import { auth, db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  updateDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const STYLE_ID = "pcls-location-attachment-styles";
const pending = new Map();
let activeForm = null;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .pcls-location-attachment{grid-column:1/-1;margin-top:2px;padding:18px;border:1px solid rgba(124,231,255,.16);border-radius:20px;background:linear-gradient(145deg,rgba(124,231,255,.055),rgba(255,255,255,.025));box-shadow:inset 0 1px rgba(255,255,255,.045),0 8px 24px rgba(0,0,0,.12)}
    .pcls-location-attachment-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:13px}
    .pcls-location-attachment-title{font-size:.9rem;font-weight:800;color:#f7fbff}
    .pcls-location-attachment-help{margin-top:5px;color:#8794a8;font-size:.72rem;line-height:1.5}
    .pcls-location-attachment-badge{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border-radius:999px;color:#e6fbff;background:linear-gradient(180deg,rgba(100,210,255,.14),rgba(76,141,255,.08));border:1px solid rgba(100,210,255,.22);font-size:.68rem;font-weight:850;white-space:nowrap;box-shadow:0 6px 18px rgba(76,141,255,.08)}
    .pcls-location-drop{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px;border:1px dashed rgba(124,231,255,.25);border-radius:17px;background:linear-gradient(180deg,rgba(0,0,0,.16),rgba(124,231,255,.025));cursor:pointer;transition:.2s ease}
    .pcls-location-drop:hover,.pcls-location-drop:focus-visible{border-color:rgba(124,231,255,.52);background:linear-gradient(180deg,rgba(0,0,0,.12),rgba(124,231,255,.06));box-shadow:0 0 0 3px rgba(124,231,255,.055);outline:none}
    .pcls-location-drop strong{display:block;font-size:.82rem;color:#f2fbff}
    .pcls-location-drop span{display:block;margin-top:5px;color:#9ba9bb;font-size:.7rem;line-height:1.45}
    .pcls-location-input{display:none!important}
    .pcls-location-paste-cta{margin-top:10px;display:flex;align-items:center;gap:9px;padding:10px 12px;border-radius:13px;color:#dff9ff;background:rgba(124,231,255,.06);border:1px solid rgba(124,231,255,.12);font-size:.72rem;font-weight:800}
    .pcls-location-paste-cta kbd{display:inline-flex;align-items:center;justify-content:center;min-width:56px;padding:4px 8px;border-radius:7px;background:linear-gradient(180deg,#1a2c42,#101b2c);border:1px solid rgba(255,255,255,.14);box-shadow:inset 0 -2px 0 rgba(0,0,0,.28),0 2px 5px rgba(0,0,0,.22);font:800 .68rem/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#fff}
    .pcls-location-paste-hint{margin-top:8px;color:#7f8da1;font-size:.64rem;line-height:1.45}
    .pcls-location-preview{display:none;align-items:center;gap:12px;margin-top:12px;padding:10px;border:1px solid rgba(99,230,190,.14);border-radius:15px;background:rgba(99,230,190,.045)}
    .pcls-location-preview.show{display:flex}
    .pcls-location-preview img{width:86px;height:64px;object-fit:cover;border-radius:11px;border:1px solid rgba(255,255,255,.09)}
    .pcls-location-preview-copy{min-width:0;flex:1}
    .pcls-location-preview-copy strong{display:block;color:#c8ffea;font-size:.74rem}
    .pcls-location-preview-copy span{display:block;margin-top:3px;color:#8391a3;font-size:.66rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pcls-location-remove{min-height:34px;padding:0 10px;border-radius:10px;border:1px solid rgba(255,105,97,.17);background:rgba(255,105,97,.055);color:#ffb9b5;font:inherit;font-size:.64rem;font-weight:740;cursor:pointer}
    .pcls-location-submit-note{display:none;margin-top:9px;color:#9ee9ff;font-size:.66rem}.pcls-location-submit-note.show{display:block}
    @media(max-width:560px){.pcls-location-attachment-head{flex-direction:column}.pcls-location-attachment-badge{align-self:flex-start}.pcls-location-preview img{width:74px;height:56px}.pcls-location-paste-cta{align-items:flex-start}.pcls-location-paste-cta kbd{flex:0 0 auto}}
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

function clipboardImageFromEvent(event) {
  const items = Array.from(event.clipboardData?.items || []);
  const imageItem = items.find(item => item.kind === "file" && item.type.startsWith("image/"));
  return imageItem?.getAsFile?.() || null;
}

function makePasteFile(file) {
  return new File(
    [file],
    `locatie-paste-${Date.now()}.${file.type.split("/")[1] || "png"}`,
    { type: file.type }
  );
}

function uiForForm(form, index) {
  if (form.dataset.pclsLocationReady === "true") return;
  form.dataset.pclsLocationReady = "true";

  const wrapper = document.createElement("section");
  wrapper.className = "pcls-location-attachment";
  wrapper.innerHTML = `
    <div class="pcls-location-attachment-head">
      <div>
        <div class="pcls-location-attachment-title">📍 Atașează o poză cu locația</div>
        <div class="pcls-location-attachment-help">JPG, PNG sau WEBP · maximum 8 MB. Poza va fi disponibilă ulterior în Detalii Cerere din Admin.</div>
      </div>
      <span class="pcls-location-attachment-badge">⌨ CTRL + V · LIPIRE RAPIDĂ</span>
    </div>
    <label class="pcls-location-drop" tabindex="0" aria-label="Adaugă o imagine și poți folosi Ctrl plus V">
      <input class="pcls-location-input" type="file" accept="image/jpeg,image/png,image/webp">
      <div>
        <strong>📷 Selectează fotografia sau lipește-o direct</strong>
        <span>Click pentru fișier · apoi poți apăsa Ctrl+V pentru a lipi imaginea copiată.</span>
      </div>
      <span aria-hidden="true">＋</span>
    </label>
    <div class="pcls-location-paste-cta"><kbd>CTRL + V</kbd><span>Poți copia o imagine din Discord, Paint, browser sau dintr-o captură de ecran și să o lipești direct în formular.</span></div>
    <div class="pcls-location-paste-hint">💡 Nu trebuie să salvezi imaginea pe PC: <strong>Copy → revino în formular → Ctrl+V</strong>.</div>
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
        // Unele browsere nu permit setarea programatică a input.files.
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

  const handlePaste = async event => {
    const file = clipboardImageFromEvent(event);
    if (!file) return;
    event.preventDefault();
    activeForm = form;
    await setFile(makePasteFile(file));
  };

  form.addEventListener("focusin", () => { activeForm = form; });
  form.addEventListener("paste", handlePaste);
  drop.addEventListener("paste", handlePaste);

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    activeForm = form;
    await setFile(file);
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

  // Permite Ctrl+V chiar dacă utilizatorul nu are focus exact în zona de atașare.
  document.addEventListener("paste", async event => {
    const file = clipboardImageFromEvent(event);
    if (!file) return;
    const targetForm = event.target?.closest?.("form") || activeForm || forms[0];
    if (!targetForm || !targetForm.dataset.pclsLocationReady) return;
    if (event.target?.closest?.("input, textarea, select, [contenteditable=\"true\"]") && !event.target?.closest?.(".pcls-location-drop, .pcls-location-attachment")) return;
    event.preventDefault();
    activeForm = targetForm;
    const attachment = targetForm.querySelector(".pcls-location-attachment");
    const input = attachment?.querySelector(".pcls-location-input");
    if (!attachment || !input) return;

    const wrapperEvent = new Event("change", { bubbles: true });
    const syntheticFile = makePasteFile(file);
    try {
      const transfer = new DataTransfer();
      transfer.items.add(syntheticFile);
      input.files = transfer.files;
      input.dispatchEvent(wrapperEvent);
    } catch (_) {
      // Handlerul form paste va acoperi cazurile în care input.files nu poate fi setat.
    }
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
