import { auth, db } from "./firebase-config.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const BOUND = "__pclsDiscordDecisionWatcherBound";
const pendingWatches = new Map();

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

async function resolveDiscordId(data = {}) {
  const candidates = [
    data.discordId,
    data.discord_id,
    data.discordUserId,
    data.discord_user_id,
    data.discord,
    data.numeDiscord
  ].map(value => String(value ?? "").trim());

  const direct = candidates.find(value => /^\d{17,20}$/.test(value));
  if (direct) return direct;

  const firebaseUid = [data.uid, data.userId, data.user_id, data.ownerUid, data.owner_uid]
    .map(value => String(value ?? "").trim())
    .find(Boolean);
  if (!firebaseUid) return "";

  const userSnap = await getDoc(doc(db, "utilizatori", firebaseUid));
  if (!userSnap.exists()) return "";
  const user = userSnap.data() || {};
  return [user.discordId, user.discord_id, user.discordUserId, user.discord_user_id, user.discord, user.numeDiscord]
    .map(value => String(value ?? "").trim())
    .find(value => /^\d{17,20}$/.test(value)) || "";
}

function first(data, keys, fallback = "-") {
  for (const key of keys) {
    const value = String(data?.[key] ?? "").trim();
    if (value) return value;
  }
  return fallback;
}

function buildMessage(requestId, data, status) {
  const code = first(data, ["codEveniment", "cod_eveniment", "cod"], `PCLS-${requestId.slice(0, 8).toUpperCase()}`);
  const department = first(data, ["departament", "department", "dept"], "PCLS").toUpperCase();
  const type = first(data, ["tip_cerere", "tipCerere", "tip", "eveniment"], "Programare");
  const name = first(data, ["nume_proprietar", "proprietar", "reprezentant", "nume", "nume_afacere", "unitate"]);
  const dateTime = first(data, ["data_ora", "dataOra"], "") || [
    first(data, ["dataProgramare", "dataDorita", "data_control", "dataControl"], ""),
    first(data, ["oraProgramare", "oraDorita", "ora_control", "oraControl"], "")
  ].filter(Boolean).join(" la ") || "-";
  const reason = first(data, ["rejectionReason", "motivRespingere", "motiv_respingere"]);
  const admin = first(data, ["procesat_de", "nume_administrator", "numeAdministrator", "administrator"], "Administrator");

  if (status === "aprobat") {
    return [
      "✅ CERERE APROBATĂ",
      "",
      `Cod cerere: ${code}`,
      `Departament: ${department}`,
      `Tip: ${type}`,
      `Solicitant: ${name}`,
      `Data / Ora: ${dateTime}`,
      `Procesată de: ${admin}`,
      "",
      "Cererea ta a fost aprobată cu succes."
    ].join("\n");
  }

  return [
    "❌ CERERE RESPINSĂ",
    "",
    `Cod cerere: ${code}`,
    `Departament: ${department}`,
    `Tip: ${type}`,
    `Solicitant: ${name}`,
    `Procesată de: ${admin}`,
    `Motiv: ${reason}`,
    "",
    "Cererea ta a fost respinsă."
  ].join("\n");
}

async function sendDecision(requestId, data, status) {
  const discordUserId = await resolveDiscordId(data);
  if (!discordUserId) throw new Error("Discord ID-ul solicitantului nu a fost găsit.");

  const token = await auth.currentUser?.getIdToken(false);
  if (!token) throw new Error("Sesiunea administratorului nu este disponibilă.");

  const response = await fetch("/api/discord-dm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      requestId,
      discordUserId,
      content: buildMessage(requestId, data, status)
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.error || `Discord DM API HTTP ${response.status}`);
}

function watchRequestDecision(requestId, expectedStatus) {
  const id = String(requestId || "").trim();
  if (!id || !["aprobat", "respins"].includes(expectedStatus)) return;

  const existing = pendingWatches.get(id);
  if (existing) existing();

  const ref = doc(db, "cereri", id);
  let previousStatus = null;
  let finished = false;

  const unsubscribe = onSnapshot(ref, snapshot => {
    if (finished || !snapshot.exists()) return;
    const data = snapshot.data() || {};
    const currentStatus = normalizeStatus(data.status);

    if (previousStatus !== null && previousStatus !== expectedStatus && currentStatus === expectedStatus) {
      finished = true;
      unsubscribe();
      pendingWatches.delete(id);

      const duplicateKey = `pcls-discord-dm:${id}:${expectedStatus}`;
      if (localStorage.getItem(duplicateKey) === "1") return;
      localStorage.setItem(duplicateKey, "1");

      void sendDecision(id, data, expectedStatus).catch(error => {
        localStorage.removeItem(duplicateKey);
        console.error("PCLS Discord DM:", error);
      });
      return;
    }

    previousStatus = currentStatus;
  }, error => {
    console.error("PCLS Discord decision watcher:", error);
    pendingWatches.delete(id);
  });

  pendingWatches.set(id, unsubscribe);
  setTimeout(() => {
    if (!finished) {
      finished = true;
      unsubscribe();
      pendingWatches.delete(id);
    }
  }, 90000);
}

function bind() {
  if (window[BOUND]) return;
  if (!window.location.pathname.toLowerCase().endsWith("/admin.html")) return;
  window[BOUND] = true;

  document.addEventListener("click", event => {
    const approve = event.target.closest(".btn-approve[data-id]");
    if (approve) {
      watchRequestDecision(approve.getAttribute("data-id"), "aprobat");
      return;
    }
    const reject = event.target.closest(".btn-reject[data-id]");
    if (reject) watchRequestDecision(reject.getAttribute("data-id"), "respins");
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
else bind();
