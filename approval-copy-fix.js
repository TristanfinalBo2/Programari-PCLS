import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const normalize = value => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

const isRegistration = item => [
  item?.tip_cerere,
  item?.tip,
  item?.categorie,
  item?.eveniment
].some(value => normalize(value) === "inregistrare");

const pick = (item, keys, fallback = "-") => {
  for (const key of keys) {
    const value = String(item?.[key] ?? "").trim();
    if (value) return value;
  }
  return fallback;
};

function getDiscordId(item) {
  return [item?.discordId, item?.discord_id, item?.discordUserId, item?.discord_user_id, item?.discord_user, item?.discord]
    .map(value => String(value ?? "").trim())
    .find(value => /^\d{17,20}$/.test(value)) || "";
}

function getDiscordMention(item) {
  const id = getDiscordId(item);
  return id ? `<@${id}>` : "-";
}

function formatDate(item) {
  const raw = item?.data_inregistrarii ?? item?.dataInregistrarii ?? item?.data_inregistrare ?? item?.dataInregistrare ?? item?.data_creare ?? item?.created_at ?? item?.createdAt;
  if (!raw) return "-";
  try {
    if (typeof raw?.toDate === "function") return raw.toDate().toLocaleString("ro-RO");
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString("ro-RO");
  } catch (_) {}
  return String(raw);
}

function setRow(selector, label, value, highlight = false) {
  const row = document.querySelector(selector);
  if (!row) return;
  const strong = row.querySelector("strong");
  const span = row.querySelector("span");
  if (strong) strong.textContent = label;
  if (span) {
    span.textContent = value || "-";
    span.style.color = highlight ? "var(--accent-primary)" : "var(--text-main)";
    span.style.textShadow = highlight ? "0 0 10px rgba(0,255,163,0.3)" : "none";
  }
}

function applyRegistrationPreview(item) {
  if (!isRegistration(item)) return;

  const telefon = pick(item, ["telefon", "telefon_contact", "telefonContact", "tel", "phone"], "");
  const email = pick(item, ["email", "email_aplicant", "e_mail", "email_contact", "mail"], "");
  const discord = getDiscordMention(item);
  const contact = [telefon, email, discord !== "-" ? discord : ""].filter(Boolean).join(" / ") || "-";
  const solicitant = pick(item, ["solicitant", "nume_solicitant", "requesterName", "reprezentant", "nume"], discord);

  setRow('#approve-modal .summary-card p:nth-child(1)', "Denumire:", pick(item, ["denumire", "nume_afacere", "unitate", "denumire_afacere", "business_name", "numeAfacere"]));
  setRow('#approve-modal .summary-card p:nth-child(2)', "Proprietar:", pick(item, ["proprietar", "nume_proprietar", "owner", "proprietar_nume"]));
  setRow('#approve-modal .summary-card p:nth-child(3)', "Administrator:", pick(item, ["administrator", "nume_administrator", "numeAdministrator", "administrator_nume", "admin"]));
  setRow('#approve-modal .summary-card p:nth-child(4)', "Date de contact (Telefon/E-mail):", contact);

  const summary = document.querySelector("#approve-modal .summary-card");
  if (!summary) return;

  let registrationExtra = summary.querySelector(".pcls-registration-preview-extra");
  if (!registrationExtra) {
    registrationExtra = document.createElement("div");
    registrationExtra.className = "pcls-registration-preview-extra";
    registrationExtra.style.display = "contents";
    registrationExtra.innerHTML = `
      <p><strong>Adresa:</strong><span></span></p>
      <p><strong>Data inregistrarii:</strong><span></span></p>
      <p style="border-top: 1px solid rgba(0,255,163,0.2); padding-top: 15px; margin-top: 5px;"><strong>Solicitant:</strong><span style="color:var(--accent-primary);text-shadow:0 0 10px rgba(0,255,163,0.3);"></span></p>
    `;
    summary.appendChild(registrationExtra);
  }

  const spans = registrationExtra.querySelectorAll("span");
  if (spans[0]) spans[0].textContent = pick(item, ["adresa", "adresa_control", "adresaControl", "strada", "street"]);
  if (spans[1]) spans[1].textContent = formatDate(item);
  if (spans[2]) spans[2].textContent = solicitant;
}

async function loadRequest(id) {
  try {
    const snap = await getDoc(doc(db, "cereri", id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.error("Registration preview:", error);
    return null;
  }
}

function clearRegistrationExtra() {
  document.querySelector("#approve-modal .summary-card .pcls-registration-preview-extra")?.remove();
}

function getVisibleRegistrationText() {
  const summary = document.querySelector("#approve-modal .summary-card");
  if (!summary) return "";
  return Array.from(summary.querySelectorAll("p"))
    .map(row => {
      const label = row.querySelector("strong")?.textContent?.trim() || "";
      const value = row.querySelector("span")?.textContent?.trim() || "";
      return label ? `${label} ${value}`.trim() : "";
    })
    .filter(Boolean)
    .join("\n");
}

function boot() {
  if (!window.location.pathname.toLowerCase().endsWith("/admin.html")) return;

  document.addEventListener("click", event => {
    const approveButton = event.target.closest(".btn-approve");
    if (approveButton) {
      const id = approveButton.getAttribute("data-id");
      clearRegistrationExtra();
      if (id) {
        setTimeout(async () => {
          const item = await loadRequest(id);
          if (item && isRegistration(item)) applyRegistrationPreview(item);
        }, 0);
      }
    }
  }, true);

  document.addEventListener("click", async event => {
    const button = event.target.closest("#approve-copy-btn");
    if (!button) return;

    const preview = document.getElementById("approval-dispatch-text");
    const summary = document.querySelector("#approve-modal .summary-card");
    const hasRegistrationPreview = Boolean(summary?.querySelector(".pcls-registration-preview-extra"));

    event.preventDefault();
    event.stopImmediatePropagation();

    const text = hasRegistrationPreview
      ? getVisibleRegistrationText()
      : String(preview?.value || preview?.textContent || "").trim();

    if (!text) {
      window.showToast?.("Nu există date de copiat.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      window.showToast?.("Datele afișate în preview au fost copiate.", "success");
      const original = button.innerHTML;
      button.innerHTML = "✓ Copiat!";
      setTimeout(() => { button.innerHTML = original; }, 1800);
    } catch (error) {
      console.error("Approval preview copy:", error);
      window.showToast?.("Nu s-a putut copia mesajul.", "error");
    }
  }, true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
