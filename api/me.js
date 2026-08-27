const crypto = require("crypto");
const SESSION_COOKIE = "pcls_discord_session";
const MAX_AGE = 60 * 60 * 24 * 7;

let cachedGoogleToken = null;
let cachedGoogleTokenExp = 0;
const profileCache = new Map();
const PROFILE_TTL = 30_000;

function parseCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function readSession(req) {
  const raw = parseCookie(req, SESSION_COOKIE);
  const secret = String(process.env.DISCORD_CLIENT_SECRET || "").trim();
  if (!raw || !secret) return null;
  const [body, signature] = raw.split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.discordId || !payload?.exp || payload.exp <= now || payload.exp > now + MAX_AGE + 60) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function decodeString(fields, key) {
  return String(fields?.[key]?.stringValue || "").trim();
}

async function googleAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGoogleToken && cachedGoogleTokenExp > now + 120) return cachedGoogleToken;

  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new Error("Lipsește FIREBASE_SERVICE_ACCOUNT_JSON în Vercel.");
  const sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON este invalid.");

  const b64 = value => Buffer.from(value).toString("base64url");
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore"
  }));
  const input = `${header}.${payload}`;
  const signature = crypto.createSign("RSA-SHA256").update(input).end().sign(sa.private_key.replace(/\\n/g, "\n"));
  const assertion = `${input}.${signature.toString("base64url")}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error("Nu s-a putut obține tokenul Google pentru Firebase Admin.");

  cachedGoogleToken = String(data.access_token);
  cachedGoogleTokenExp = now + Number(data.expires_in || 3600);
  return cachedGoogleToken;
}

async function findUserProfile(accessToken, discordId, email) {
  const cacheKey = `${discordId}|${email}`;
  const cached = profileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;

  const base = "https://firestore.googleapis.com/v1/projects/pcls-portal/databases/(default)/documents:runQuery";
  const fields = ["discordId", "discord", "discord_id"];
  if (email) fields.push("email");

  const responses = await Promise.all(fields.map(fieldPath => fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "utilizatori" }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: "EQUAL",
            value: { stringValue: String(fieldPath === "email" ? email : discordId) }
          }
        },
        limit: 1
      }
    })
  }).then(async response => {
    if (!response.ok) return null;
    const rows = await response.json().catch(() => []);
    if (!Array.isArray(rows)) return null;
    return rows.find(item => item.document)?.document || null;
  }).catch(() => null)));

  const profile = responses.find(Boolean) || null;
  profileCache.set(cacheKey, { profile, expiresAt: Date.now() + PROFILE_TTL });
  return profile;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  const session = readSession(req);
  if (!session) return res.status(401).json({ ok: false, error: "Nu ești autentificat cu Discord." });

  try {
    const accessToken = await googleAccessToken();
    const profile = await findUserProfile(accessToken, String(session.discordId), String(session.email || "").trim());
    const fields = profile?.fields || {};
    const role = decodeString(fields, "role") || decodeString(fields, "rol") || "user";
    const username = String(session.username || session.name || "Utilizator Discord");

    return res.status(200).json({
      ok: true,
      user: {
        discordId: String(session.discordId),
        name: username,
        username,
        globalName: String(session.globalName || username),
        email: String(session.email || ""),
        role
      }
    });
  } catch (error) {
    console.error("Discord session profile error:", error);
    const username = String(session.username || session.name || "Utilizator Discord");
    return res.status(200).json({
      ok: true,
      user: {
        discordId: String(session.discordId),
        name: username,
        username,
        globalName: String(session.globalName || username),
        email: String(session.email || ""),
        role: "user"
      }
    });
  }
};