import { auth, db } from "./firebase-config.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const LABELS = { isuls: "ISULS", dsls: "DSLS", mmls: "MMLS", ssmls: "SSMLS" };
const DISCORD_DEPARTMENTS = new Set(Object.keys(LABELS));
const BIND_FLAG = "__pclsApprovalDispatchBound";
const OP_TIMEOUT_MS = 15000;

let selected = null;
let busy = false;

const val = (o, keys, fallback = "-") => {
  for (const k of keys) {
    const v = String(o?.[k] ?? "").trim();
    if (v) return v;
  }
  return fallback;
};

const dept = o => {
  const d = val(o, ["departament", "department", "dept"], "").toLowerCase().trim();
  return LABELS[d] ? d : "";
};

const normalizeType = value => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

// DOAR aceste 3 tipuri folosesc confirmarea clasică din admin.html:
// PROGRAMARE / INREGISTRARE / EVENIMENT.
function isSimpleApprovalCase(o) {
  const candidates = [o?.tip_cerere, o?.tip, o?.categorie, o?.eveniment]
    .map(normalizeType)
    .filter(Boolean);

  return candidates.some(type =>
    type === "programare" ||
    type === "inregistrare" ||
    type === "eveniment"
  );
};

function withTimeout(promise, ms = OP_TIMEOUT_MS, message = "Operația a durat prea mult. Reîncearcă.") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

const dateFmt = v => {
  const x = String(v || "").trim();
  if (!x) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) {
    const [y, m, d] = x.split("-");
    return `${d}.${m}.${y}`;
  }
  return x.replace(/\//g, ".");
};

function controlDate(o) {
  const d = val(o, ["data_control", "dataControl", "dataProgramare", "dataDorita"], "");
  if (d) return dateFmt(d);
  const x = val(o, ["data_ora", "dataOra"], "");
  return x.includes(" la ") ? dateFmt(x.split(" la ")[0]) : dateFmt(x);
}

function controlTime(o) {
  const t = val(o, ["ora_control", "oraControl", "oraProgramare", "oraDorita", "ora"], "");
  if (t) return t;
  const x = val(o, ["data_ora", "dataOra"], "");
  return x.includes(" la ") ? x.split(" la ").slice(1).join(" la ").trim() : "-";
}

function buildMessage(o) {
  const d = dept(o);
  const business = val(o, ["nume_afacere", "unitate", "denumire_afacere", "business_name", "nume_proprietar", "proprietar", "reprezentant", "nume"]);
  const admin = val(o, ["nume_administrator", "numeAdministrator", "administrator", "admin", "nume_proprietar", "proprietar", "reprezentant", "nume"]);
  const phone = val(o, ["telefon", "telefon_contact", "telefonContact", "tel", "phone"]);
  const address = val(o, ["adresa", "adresa_control", "adresaControl", "strada", "street"]);
  const extra = val(o, ["informatii_extra", "informatiiExtra", "extra_info", "detalii_extra", "detalii", "observatii", "observații", "descriere"]);
  const location = val(o, ["locatie", "location", "nr_locatie", "numar_locatie", "numarLocatie"]);

  return [
    `📋 **Programare ${LABELS[d]} / PCLS**`,
    `🏢 **Afacere:** ${business}`,
    `👤 **Administrator:** ${admin}`,
    `📞 **Telefon:** ${phone}`,
    `📅 **Data:** ${controlDate(o)}`,
    `🕐 **Ora:** ${controlTime(o)}`,
    `🏠 **Adresă:** ${address}`,
    `📝 **Extra:** ${extra}`,
    `📍 **Locație:** ${location}`
  ].join("\n");
}

async function load(id) {
  const snap = await withTimeout(
    getDoc(doc(db, "cereri", id)),
    OP_TIMEOUT_MS,
    "Cererea nu a putut fi încărcată la timp."
  );
  if (!snap.exists()) throw new Error("Cererea nu mai există.");
  return { id: snap.id, ...snap.data() };
}

function styles() {
  if (document.getElementById("approval-dispatch-style")) return;
  const s = document.createElement("style");
  s.id = "approval-dispatch-style";
  s.textContent = `.approval-dispatch-preview{margin-top:18px;padding:0;border-radius:18px;border:0;background:transparent}.approval-dispatch-preview textarea{display:block;width:100%;min-height:260px;resize:vertical;padding:14px;border-radius:14px;border:1px solid rgba(88,166,255,.18);background:linear-gradient(145deg,rgba(13,28,48,.72),rgba(7,14,24,.52));color:#e7edf7;font:500 .75rem/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;box-sizing:border-box}.approval-dispatch-preview textarea[readonly]{cursor:default}.approval-dispatch-error{margin-top:10px;color:#ffd1d0;font-size:.7rem;font-weight:700}.approval-dispatch-ok{margin-top:10px;color:#caffec;font-size:.68rem;font-weight:700}`;
  document.head.appendChild(s);
}

function ensurePreview() {
  const summary = document.querySelector("#approve-modal .summary-card");
  if (!summary) return null;
  summary.style.display = "none";
  let p = document.getElementById("approval-dispatch-preview");
  if (p) return p;
  p = document.createElement("section");
  p.id = "approval-dispatch-preview";
  p.className = "approval-dispatch-preview";
  p.innerHTML = `<textarea id="approval-dispatch-text" spellcheck="false" readonly aria-label="Mesaj Discord"></textarea><div id="approval-dispatch-error" class="approval-dispatch-error"></div><div id="approval-dispatch-ok" class="approval-dispatch-ok"></div>`;
  summary.insertAdjacentElement("afterend", p);
  return p;
}

function restoreClassicSummary() {
  const summary = document.querySelector("#approve-modal .summary-card");
  if (summary) summary.style.display = "";
  const preview = document.getElementById("approval-dispatch-preview");
  if (preview) preview.remove();
}

async function send(o, content) {
  if (!auth.currentUser) throw new Error("Sesiunea a expirat. Reautentifică-te.");
  const token = await withTimeout(
    auth.currentUser.getIdToken(true),
    OP_TIMEOUT_MS,
    "Tokenul Firebase nu a putut fi obținut la timp."
  );
  if (!token) throw new Error("Tokenul Firebase nu a putut fi obținut.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OP_TIMEOUT_MS);

  try {
    const r = await fetch("/api/discord-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        department: dept(o),
        content,
        locationImage: o.locationImage || null
      }),
      signal: controller.signal
    });

    const b = await r.json().catch(() => null);
    if (!r.ok || !b?.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  } finally {
    clearTimeout(timer);
  }
}

async function approve(o, discordSent = false) {
  const admin = auth.currentUser;
  if (!admin) throw new Error("Sesiunea a expirat.");
  const snap = await withTimeout(
    getDoc(doc(db, "utilizatori", admin.uid)),
    OP_TIMEOUT_MS,
    "Profilul administratorului nu a putut fi încărcat la timp."
  );
  const data = snap.exists() ? snap.data() || {} : {};
  const name = String(data.nume || data.name || data.displayName || admin.displayName || admin.email?.split("@")[0] || "Admin").trim();
  const update = {
    status: "aprobat",
    procesat_de: `${name} (Aprobat cererea)`,
    data_procesare: new Date().toLocaleString("ro-RO"),
    deleted: false
  };
  if (discordSent) {
    update.discordDispatchSent = true;
    update.discordDispatchDepartment = dept(o);
  }
  await withTimeout(
    updateDoc(doc(db, "cereri", o.id), update),
    OP_TIMEOUT_MS,
    "Aprobarea nu a putut fi salvată la timp."
  );
}

async function confirmDiscord(e) {
  if (busy || !selected?.id || isSimpleApprovalCase(selected)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  busy = true;

  const btn = document.getElementById("approve-ok-btn");
  const p = ensurePreview();
  const ta = p?.querySelector("#approval-dispatch-text");
  const er = p?.querySelector("#approval-dispatch-error");
  const ok = p?.querySelector("#approval-dispatch-ok");
  const original = btn?.innerHTML || "Confirmă & Acceptă";

  if (btn) { btn.disabled = true; btn.innerHTML = "Se procesează…"; }
  if (er) er.textContent = "";
  if (ok) ok.textContent = "";

  try {
    const latest = await load(selected.id);
    if (isSimpleApprovalCase(latest)) return;

    const content = ta?.value?.trim() || buildMessage(latest);
    await send(latest, content);

    if (ok) ok.textContent = latest.locationImage
      ? "✓ Mesajul și fotografia au fost trimise pe Discord."
      : "✓ Mesajul a fost trimis pe Discord.";

    await approve(latest, true);

    setTimeout(() => {
      document.getElementById("approve-modal")?.classList.remove("active");
      restoreClassicSummary();
      selected = null;
    }, 350);
  } catch (err) {
    console.error("Approval dispatch:", err);
    const message = String(err?.message || err);
    if (message.toLowerCase().includes("aborted")) {
      if (er) er.textContent = "Aprobarea a expirat deoarece Discord nu a răspuns la timp. Cererea NU a fost marcată ca aprobată.";
    } else if (er) {
      er.textContent = `Aprobarea NU a fost finalizată. ${message}`;
    }
  } finally {
    busy = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
}

function bind() {
  if (!location.pathname.toLowerCase().endsWith("/admin.html")) return;
  if (window[BIND_FLAG]) return;
  window[BIND_FLAG] = true;

  styles();

  // Selectăm cererea curentă și pregătim DOAR preview-ul Discord pentru ISULS/DSLS/MMLS/SSMLS.
  document.addEventListener("click", async e => {
    const b = e.target.closest(".btn-approve");
    if (!b) return;
    const id = b.getAttribute("data-id");
    if (!id) return;

    try {
      selected = await load(id);

      // Pentru Programare / Înregistrare / Eveniment nu atingem deloc
      // handlerul existent din admin.html: popup-ul clasic rămâne intact.
      if (isSimpleApprovalCase(selected)) {
        restoreClassicSummary();
        return;
      }

      const p = ensurePreview();
      if (p) {
        p.querySelector("#approval-dispatch-text").value = buildMessage(selected);
        p.querySelector("#approval-dispatch-error").textContent = "";
        p.querySelector("#approval-dispatch-ok").textContent = "";
      }
    } catch (err) {
      console.error("Approval preview:", err);
      selected = null;
    }
  }, true);

  // Interceptăm Confirmă & Acceptă NUMAI pentru fluxul Discord.
  document.addEventListener("click", e => {
    if (!e.target.closest("#approve-ok-btn")) return;
    if (!selected || isSimpleApprovalCase(selected)) return;
    void confirmDiscord(e);
  }, true);

  document.addEventListener("click", e => {
    if (e.target.closest("#approve-cancel-btn") || e.target.closest("#approve-close")) {
      selected = null;
      busy = false;
      const btn = document.getElementById("approve-ok-btn");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = "Confirmă & Acceptă";
      }
      restoreClassicSummary();
    }
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
else bind();
