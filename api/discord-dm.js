const PROJECT_ID = "pcls-portal";
const BOT_TOKEN_ENV = "DISCORD_BOT_TOKEN";
const ALLOWED_ROLES = new Set(["admin", "superadmin", "conducere", "isuls", "dsls", "mmls", "ssmls"]);

function json(res, status, body) {
  return res.status(status).json(body);
}

function decodeJwtPayload(idToken) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Tokenul Firebase este invalid.");
  const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  try {
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    throw new Error("Tokenul Firebase este invalid.");
  }
}

async function verifyFirebaseToken(idToken) {
  const payload = decodeJwtPayload(idToken);
  const uid = String(payload.user_id || payload.sub || "").trim();
  const audience = String(payload.aud || "").trim();
  const issuer = String(payload.iss || "").trim();
  if (!uid || audience !== PROJECT_ID || issuer !== `https://securetoken.google.com/${PROJECT_ID}`) {
    throw new Error("Sesiunea Firebase este invalidă.");
  }
  return uid;
}

async function getRole(uid, idToken) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/utilizatori/${encodeURIComponent(uid)}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  if (!response.ok) throw new Error("Profilul administratorului nu a putut fi verificat.");
  const body = await response.json();
  const fields = body.fields || {};
  return String(fields.role?.stringValue || fields.rol?.stringValue || "").trim().toLowerCase();
}

function normalizeDiscordId(value) {
  const raw = String(value || "").trim();
  return /^\d{17,20}$/.test(raw) ? raw : "";
}

async function sendDm(discordUserId, content) {
  const botToken = String(process.env[BOT_TOKEN_ENV] || "").trim();
  if (!botToken) throw new Error("Variabila Vercel DISCORD_BOT_TOKEN nu este configurată.");

  const headers = {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json"
  };

  const channelResponse = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers,
    body: JSON.stringify({ recipient_id: discordUserId })
  });

  const channelBody = await channelResponse.json().catch(() => null);
  if (!channelResponse.ok || !channelBody?.id) {
    throw new Error(`Discord nu a permis deschiderea DM-ului: ${channelBody?.message || `HTTP ${channelResponse.status}`}`);
  }

  const messageResponse = await fetch(`https://discord.com/api/v10/channels/${channelBody.id}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: String(content || "").slice(0, 2000) })
  });

  const messageBody = await messageResponse.json().catch(() => null);
  if (!messageResponse.ok) {
    throw new Error(`Discord nu a permis trimiterea DM-ului: ${messageBody?.message || `HTTP ${messageResponse.status}`}`);
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method Not Allowed" });

  try {
    const authorization = String(req.headers.authorization || "");
    if (!authorization.startsWith("Bearer ")) return json(res, 401, { ok: false, error: "Autentificare necesară." });
    const idToken = authorization.slice(7).trim();
    const uid = await verifyFirebaseToken(idToken);
    const role = await getRole(uid, idToken);
    if (!ALLOWED_ROLES.has(role)) return json(res, 403, { ok: false, error: "Nu ai permisiunea de a trimite notificări Discord." });

    const body = req.body || {};
    const requestId = String(body.requestId || "").trim();
    const discordUserId = normalizeDiscordId(body.discordUserId);
    const content = String(body.content || "").trim();

    if (!requestId) return json(res, 400, { ok: false, error: "ID-ul cererii lipsește." });
    if (!discordUserId) return json(res, 400, { ok: false, error: "Discord User ID invalid sau lipsă." });
    if (!content) return json(res, 400, { ok: false, error: "Mesajul este gol." });

    await sendDm(discordUserId, content);
    return json(res, 200, { ok: true, requestId });
  } catch (error) {
    console.error("/api/discord-dm:", error);
    return json(res, 500, { ok: false, error: error?.message || "Eroare internă." });
  }
}
