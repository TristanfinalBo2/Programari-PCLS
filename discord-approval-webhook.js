import { auth, db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const WEBHOOKS = {
  isuls: "https://discord.com/api/webhooks/1537535020246503525/_8QoK7T7CY8J4bdPaJrUTERqOfARB11a5JU9EIIOPWerhsP30OWJWTD3uinnj7xIkKuu",
  dsls: "",
  mmls: "",
  ssmls: ""
};

const DEPARTMENT_PROTOCOL = {
  isuls: "**@🧯┊I.S.U.L.S.**",
  dsls: "**@D.S.L.S.**",
  mmls: "**@M.M.L.S.**",
  ssmls: "**@S.S.M.L.S.**"
};

let selectedRequest = null;
let busy = false;

const norm = value => String(value ?? "").trim().toLowerCase();
const esc = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function valueOf(item, keys, fallback = "-") {
  for (const key of keys) {
    const value = String(item?.[key] ?? "").trim();
    if (value) return value;
  }
  return fallback;
}

function departmentOf(item) {
  return norm(valueOf(item, ["departament", "department", "dept"], "isuls"));
}

function businessNameOf(item) {
  return valueOf(item, [
    "nume_afacere",
    "unitate",
    "denumire_afacere",
    "business_name",
    "nume_proprietar",
    "proprietar",
    "reprezentant",
    "nume"
  ]);
}

function controlDateOf(item) {
  const explicitDate = valueOf(item, ["data_control", "dataControl", "dataProgramare", "dataDorita", "data"] , "");
  const explicitTime = valueOf(item, ["ora_control", "oraControl", "oraProgramare", "oraDorita", "ora"], "");
  if (explicitDate && explicitTime) return `${explicitDate}`;
  if (explicitDate) return explicitDate;
  const dateTime = valueOf(item, ["data_ora", "dataOra"], "-");
  if (dateTime.includes(" la ")) return dateTime.split(" la ")[0].trim();
  return dateTime;
}

function controlTimeOf(item) {
  const explicitTime = valueOf(item, ["ora_control", "oraControl", "oraProgramare", "oraDorita", "ora"], "");
  if (explicitTime) return explicitTime;
  const dateTime = valueOf(item, ["data_ora", "dataOra"], "");
  if (dateTime.includes(" la ")) return dateTime.split(" la ").slice(1).join(" la ").trim();
  return "-";
}

function administratorOf(item) {
  return valueOf(item, [
    "nume_administrator",
    "numeAdministrator",
    "administrator",
    "admin",
    "nume_proprietar",
    "proprietar",
    "reprezentant",
    "nume"
  ]);
}

function phoneOf(item) {
  return valueOf(item, ["telefon", "telefon_contact", "telefonContact", "tel", "phone"]);
}

function locationOf(item) {
  return valueOf(item, ["locatie", "location", "nr_locatie", "numar_locatie", "numarLocatie"], "-");
}

function addressOf(item) {
  return valueOf(item, ["adresa", "adresa_control", "adresaControl", "strada", "street"]);
}

function extraInfoOf(item) {
  return valueOf(item, ["informatii_extra", "informatiiExtra", "extra_info", "detalii_extra", "detalii", "observatii", "observații", "descriere"]);
}

function messageFor(item) {
  const dept = departmentOf(item);
  const deptLabel = (dept || "isuls").toUpperCase();
  const business = businessNameOf(item);
  const date = controlDateOf(item);
  const admin = administratorOf(item);
  const phone = phoneOf(item);
  const location = locationOf(item);
  const address = addressOf(item);
  const time = controlTimeOf(item);
  const extra = extraInfoOf(item);
  const protocol = DEPARTMENT_PROTOCOL[dept] || `**@${deptLabel}**`;

  return [
    `Programare ${deptLabel}/PCLS: ${business}`,
    "",
    `Data controlului ${date}`,
    "",
    `Numele Administratorului: ${admin} Nr. de telefon: ${phone} Locația: ${location} Adresa: ${address} Ora controlului: ${time} Informatii extra: ${extra} Protocol Atins de CONTROL/INSPECTIE: ${protocol}`
  ].join("\n");
}

function webhookFor(item) {
  return WEBHOOKS[departmentOf(item)] || "";
}

function ensureStyles() {
  if (document.getElementById("discord-approval-preview-style")) return;
  const style = document.createElement("style");
  style.id = "discord-approval-preview-style";
  style.textContent = `
    .discord-approval-preview{margin-top:18px;padding:14px;border-radius:17px;border:1px solid rgba(88,166,255,.18);background:linear-gradient(145deg,rgba(13,28,48,.72),rgba(7,14,24,.52));box-shadow:inset 0 1px rgba(255,255,255,.03)}
    .discord-approval-preview-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.discord-approval-preview-title{font-size:.74rem;font-weight:800;color:#dff5ff;text-transform:uppercase;letter-spacing:.08em}.discord-approval-preview-status{font-size:.58rem;font-weight:800;color:#9ee9ff;padding:4px 7px;border-radius:999px;border:1px solid rgba(100,210,255,.14);background:rgba(100,210,255,.05);text-transform:uppercase}
    .discord-approval-preview pre{margin:0;white-space:pre-wrap;word-break:break-word;font:500 .72rem/1.58 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e7edf7}.discord-approval-preview-note{margin-top:9px;color:#7f8aa0;font-size:.62rem;line-height:1.45}.discord-approval-error{margin-top:10px;color:#ffd1d0;font-size:.7rem;font-weight:700}.discord-approval-send-state{margin-top:10px;color:#caffec;font-size:.68rem;font-weight:700}
  `;
  document.head.appendChild(style);
}

function injectPreview() {
  const summary = document.querySelector("#approve-modal .summary-card");
  if (!summary || document.getElementById("discord-approval-preview")) return document.getElementById("discord-approval-preview");
  const section = document.createElement("section");
  section.id = "discord-approval-preview";
  section.className = "discord-approval-preview";
  section.innerHTML = `
    <div class="discord-approval-preview-head">
      <div class="discord-approval-preview-title">Preview Discord</div>
      <div id="discord-approval-preview-status" class="discord-approval-preview-status">Pregătit</div>
    </div>
    <pre id="discord-approval-preview-text"></pre>
    <div id="discord-approval-preview-note" class="discord-approval-preview-note"></div>
    <div id="discord-approval-preview-error" class="discord-approval-error"></div>
    <div id="discord-approval-send-state" class="discord-approval-send-state"></div>
  `;
  summary.insertAdjacentElement("afterend", section);
  return section;
}

function paintPreview(item) {
  const section = injectPreview();
  if (!section) return;
  const text = messageFor(item);
  const webhook = webhookFor(item);
  section.querySelector("#discord-approval-preview-text").textContent = text;
  section.querySelector("#discord-approval-preview-status").textContent = webhook ? `${departmentOf(item).toUpperCase()} • WEBHOOK OK` : `${departmentOf(item).toUpperCase()} • WEBHOOK NESETAT`;
  section.querySelector("#discord-approval-preview-note").textContent = webhook
    ? "Acesta este exact mesajul care va fi trimis în canalul Discord după confirmarea aprobării."
    : "Nu există încă un webhook configurat pentru acest departament. Cererea nu va fi aprobată până când webhook-ul nu este configurat.";
  section.querySelector("#discord-approval-preview-error").textContent = "";
  section.querySelector("#discord-approval-send-state").textContent = "";
}

async function loadRequest(id) {
  const snap = await getDoc(doc(db, "cereri", id));
  if (!snap.exists()) throw new Error("Cererea nu mai există.");
  return { id: snap.id, ...snap.data() };
}

async function currentAdminName() {
  const user = auth.currentUser;
  if (!user) return "Admin";
  try {
    const snap = await getDoc(doc(db, "utilizatori", user.uid));
    const data = snap.exists() ? snap.data() || {} : {};
    return String(data.nume || data.name || data.displayName || user.displayName || user.email?.split("@")[0] || "Admin").trim();
  } catch {
    return String(user.displayName || user.email?.split("@")[0] || "Admin").trim();
  }
}

async function sendWebhook(item) {
  const webhook = webhookFor(item);
  if (!webhook) throw new Error(`Nu există webhook configurat pentru departamentul ${departmentOf(item).toUpperCase()}.`);
  const content = messageFor(item);
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Discord webhook HTTP ${response.status}${detail ? ` — ${detail.slice(0, 180)}` : ""}`);
  }
}

async function handleApproveConfirm(event) {
  if (busy) return;
  const id = selectedRequest?.id;
  if (!id) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  busy = true;

  const button = document.getElementById("approve-ok-btn");
  const section = injectPreview();
  const status = section?.querySelector("#discord-approval-preview-status");
  const error = section?.querySelector("#discord-approval-preview-error");
  const sendState = section?.querySelector("#discord-approval-send-state");
  const original = button?.innerHTML || "Confirmă & Acceptă";
  if (button) { button.disabled = true; button.innerHTML = "Se trimite în Discord…"; }
  if (error) error.textContent = "";
  if (sendState) sendState.textContent = "";

  try {
    const latest = await loadRequest(id);
    paintPreview(latest);
    const dept = departmentOf(latest);
    if (!webhookFor(latest)) throw new Error(`Webhook-ul pentru ${dept.toUpperCase()} nu este configurat încă.`);

    if (status) status.textContent = "TRIMITERE…";
    await sendWebhook(latest);
    if (sendState) sendState.textContent = "✓ Mesajul Discord a fost trimis cu succes.";
    if (status) status.textContent = "TRIMIS ✓";

    const adminName = await currentAdminName();
    await updateDoc(doc(db, "cereri", id), {
      status: "aprobat",
      procesat_de: `${adminName} (Aprobat cererea)`,
      data_procesare: new Date().toLocaleString("ro-RO"),
      deleted: false,
      discordWebhookSent: true,
      discordWebhookDepartment: dept,
      discordWebhookSentAt: new Date().toISOString()
    });

    window.dispatchEvent(new CustomEvent("pcls:request-approved", { detail: { id, department: dept } }));
    setTimeout(() => {
      const modal = document.getElementById("approve-modal");
      modal?.classList.remove("active");
      selectedRequest = null;
    }, 450);
  } catch (error) {
    console.error("Discord approval webhook:", error);
    if (status) status.textContent = "EROARE";
    if (error) {
      const message = String(error.message || error);
      if (error instanceof TypeError && /fetch/i.test(message)) {
        if (error) {
          // Discord/CORS can manifest here in browser-based webhook calls.
        }
      }
      if (section) section.querySelector("#discord-approval-preview-error").textContent = `Aprobarea NU a fost salvată. ${message}`;
    }
    if (button) { button.disabled = false; button.innerHTML = original; }
  } finally {
    busy = false;
  }
}

function attach() {
  if (!window.location.pathname.toLowerCase().endsWith("/admin.html")) return;
  ensureStyles();

  document.addEventListener("click", async event => {
    const button = event.target.closest(".btn-approve");
    if (!button) return;
    const id = button.getAttribute("data-id");
    if (!id) return;
    try {
      const item = await loadRequest(id);
      selectedRequest = item;
      paintPreview(item);
    } catch (error) {
      console.error("Nu pot încărca preview-ul Discord:", error);
    }
  }, true);

  document.addEventListener("click", event => {
    const confirm = event.target.closest("#approve-ok-btn");
    if (!confirm) return;
    void handleApproveConfirm(event);
  }, true);

  document.addEventListener("click", event => {
    if (event.target.closest("#approve-cancel-btn") || event.target.closest("#approve-close")) {
      selectedRequest = null;
      busy = false;
    }
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", attach, { once: true });
else attach();
