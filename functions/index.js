const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();
const DISCORD_BOT_TOKEN = defineSecret("DISCORD_BOT_TOKEN");

const ADMIN_ROLES = new Set(["admin", "superadmin"]);
const DECISION_STATUSES = new Set(["aprobat", "respins"]);

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function firstValue(object, keys, fallback = "") {
  for (const key of keys) {
    const value = String(object?.[key] ?? "").trim();
    if (value) return value;
  }
  return fallback;
}

function requestDiscordId(data) {
  const direct = firstValue(data, [
    "discordId",
    "discord_id",
    "discordUserId",
    "discord_user_id",
    "discord",
    "numeDiscord"
  ]);
  if (/^\d{17,20}$/.test(direct)) return direct;

  const uid = firstValue(data, ["uid", "userId", "user_id", "ownerUid", "owner_uid"]);
  return uid;
}

function decisionMessage(requestId, data, status) {
  const code = firstValue(data, ["codEveniment", "cod_eveniment", "cod"], `PCLS-${requestId.slice(0, 8).toUpperCase()}`);
  const department = firstValue(data, ["departament", "department", "dept"], "PCLS").toUpperCase();
  const requestType = firstValue(data, ["tip_cerere", "tipCerere", "tip", "eveniment"], "Programare");
  const name = firstValue(data, ["nume_proprietar", "proprietar", "reprezentant", "nume", "nume_afacere", "unitate"], "-");
  const dateTime = firstValue(data, ["data_ora", "dataOra"], "") || [
    firstValue(data, ["dataProgramare", "dataDorita", "data_control", "dataControl"]),
    firstValue(data, ["oraProgramare", "oraDorita", "ora_control", "oraControl"])
  ].filter(Boolean).join(" la ") || "-";
  const reason = firstValue(data, ["rejectionReason", "motivRespingere", "motiv_respingere"], "-");
  const admin = firstValue(data, ["procesat_de", "nume_administrator", "numeAdministrator", "administrator"], "Administrator");

  if (status === "aprobat") {
    return [
      "✅ CERERE APROBATĂ",
      "",
      `Cod cerere: ${code}`,
      `Departament: ${department}`,
      `Tip: ${requestType}`,
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
    `Tip: ${requestType}`,
    `Solicitant: ${name}`,
    `Procesată de: ${admin}`,
    `Motiv: ${reason}`,
    "",
    "Cererea ta a fost respinsă."
  ].join("\n");
}

async function sendDiscordDm(discordUserId, content) {
  const token = DISCORD_BOT_TOKEN.value().trim();
  if (!token) throw new Error("Secretul DISCORD_BOT_TOKEN nu este configurat.");

  const headers = {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json"
  };

  const channelResponse = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers,
    body: JSON.stringify({ recipient_id: discordUserId })
  });

  const channelBody = await channelResponse.json().catch(() => null);
  if (!channelResponse.ok || !channelBody?.id) {
    const detail = channelBody?.message || `HTTP ${channelResponse.status}`;
    throw new Error(`Discord nu a permis deschiderea DM-ului: ${detail}`);
  }

  const messageResponse = await fetch(`https://discord.com/api/v10/channels/${channelBody.id}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: content.slice(0, 2000) })
  });

  const messageBody = await messageResponse.json().catch(() => null);
  if (!messageResponse.ok) {
    const detail = messageBody?.message || `HTTP ${messageResponse.status}`;
    throw new Error(`Discord nu a permis trimiterea DM-ului: ${detail}`);
  }
}

exports.deleteUserAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Trebuie să fii autentificat.");
  }

  const requesterUid = request.auth.uid;
  const targetUid = String(request.data?.uid || "").trim();

  if (!targetUid) {
    throw new HttpsError("invalid-argument", "UID-ul utilizatorului este obligatoriu.");
  }

  if (targetUid === requesterUid) {
    throw new HttpsError("permission-denied", "Nu îți poți șterge propriul cont din panoul de administrare.");
  }

  const requesterSnap = await db.collection("utilizatori").doc(requesterUid).get();
  if (!requesterSnap.exists) {
    throw new HttpsError("permission-denied", "Profilul administratorului nu există.");
  }

  const requesterData = requesterSnap.data() || {};
  const requesterRole = normalizeRole(requesterData.role || requesterData.rol);

  if (!ADMIN_ROLES.has(requesterRole)) {
    throw new HttpsError("permission-denied", "Nu ai permisiunea de a șterge conturi.");
  }

  let targetUser;
  try {
    targetUser = await getAuth().getUser(targetUid);
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      await db.collection("utilizatori").doc(targetUid).delete().catch(() => {});
      return {
        ok: true,
        uid: targetUid,
        message: "Documentul utilizatorului a fost șters; contul Firebase Authentication nu mai exista."
      };
    }

    console.error("getUser failed:", error);
    throw new HttpsError("internal", "Nu am putut identifica utilizatorul.");
  }

  const targetSnap = await db.collection("utilizatori").doc(targetUid).get();
  const targetData = targetSnap.exists ? (targetSnap.data() || {}) : {};
  const targetRole = normalizeRole(targetData.role || targetData.rol);

  if (targetRole === "superadmin" && requesterRole !== "superadmin") {
    throw new HttpsError("permission-denied", "Doar un superadmin poate șterge un superadmin.");
  }

  await getAuth().deleteUser(targetUser.uid);
  await db.collection("utilizatori").doc(targetUser.uid).delete();

  return {
    ok: true,
    uid: targetUser.uid,
    email: targetUser.email || null,
    message: "Contul a fost șters complet."
  };
});

exports.notifyDiscordRequestDecision = onDocumentUpdated(
  {
    document: "cereri/{cerereId}",
    secrets: [DISCORD_BOT_TOKEN]
  },
  async (event) => {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    const beforeStatus = normalizeStatus(before.status);
    const afterStatus = normalizeStatus(after.status);

    // Nu atinge fluxul actual: reacționăm doar după ce Firestore a schimbat statusul.
    if (beforeStatus === afterStatus || !DECISION_STATUSES.has(afterStatus)) return null;

    const requestId = String(event.params?.cerereId || "").trim();
    const rawDiscordId = requestDiscordId(after);
    let discordUserId = rawDiscordId;

    // Unele cereri pot păstra UID-ul Firebase în cerere în loc de Discord ID.
    if (!/^\d{17,20}$/.test(discordUserId) && discordUserId) {
      const userSnap = await db.collection("utilizatori").doc(discordUserId).get();
      if (userSnap.exists) {
        const userData = userSnap.data() || {};
        discordUserId = firstValue(userData, ["discordId", "discord_id", "discordUserId", "discord_user_id", "discord", "numeDiscord"]);
      }
    }

    if (!/^\d{17,20}$/.test(discordUserId)) {
      console.warn("Discord DM skipped: Discord ID lipsă sau invalid", { requestId, discordUserId: rawDiscordId || null });
      return null;
    }

    try {
      const content = decisionMessage(requestId, after, afterStatus);
      await sendDiscordDm(discordUserId, content);
      console.log("Discord DM sent", { requestId, discordUserId, status: afterStatus });
    } catch (error) {
      // Eșecul DM-ului NU schimbă și NU anulează statusul cererii.
      console.error("Discord DM failed", {
        requestId,
        discordUserId,
        status: afterStatus,
        error: error?.message || String(error)
      });
    }
    return null;
  }
);
