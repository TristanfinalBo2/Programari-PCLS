const crypto = require("crypto");

const SESSION_COOKIE = "pcls_discord_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function send(res, status, body) {
  return res.status(status).json(body);
}

function parseCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const piece of raw.split(";")) {
    const [key, ...rest] = piece.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function readSession(req) {
  const raw = parseCookie(req, SESSION_COOKIE);
  const secret = String(process.env.DISCORD_CLIENT_SECRET || "").trim();
  if (!raw || !secret) return null;
  const split = raw.split(".");
  if (split.length !== 2) return null;
  const [body, signature] = split;
  const expected = sign(body, secret);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.discordId || !payload?.exp || payload.exp < now) return null;
    if (payload.exp > now + SESSION_MAX_AGE + 60) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function firestoreValue(value) {
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value)) return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
}

function decodeFields(fields = {}) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value?.stringValue !== undefined) out[key] = value.stringValue;
    else if (value?.integerValue !== undefined) out[key] = Number(value.integerValue);
    else if (value?.doubleValue !== undefined) out[key] = value.doubleValue;
    else if (value?.booleanValue !== undefined) out[key] = value.booleanValue;
    else if (value?.timestampValue !== undefined) out[key] = value.timestampValue;
    else if (value?.nullValue !== undefined) out[key] = null;
    else if (value?.mapValue) out[key] = decodeFields(value.mapValue.fields || {});
    else if (value?.arrayValue) out[key] = (value.arrayValue.values || []).map(item => decodeFields({ value: item }).value);
  }
  return out;
}

async function serviceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new Error("Lipsește FIREBASE_SERVICE_ACCOUNT_JSON în Vercel.");
  const sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON este invalid.");
  return sa;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\\+/g, "-").replace(/\\//g, "_");
}

function signJwt(header, payload, privateKey) {
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createSign("RSA-SHA256").update(input).end().sign(privateKey);
  return `${input}.${signature.toString("base64url")}`;
}

async function googleAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: sa.client_email,
      sub: sa.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/datastore"
    },
    sa.private_key.replace(/\\n/g, "\n")
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error("Nu s-a putut obține tokenul Google pentru Firebase Admin.");
  return data.access_token;
}

async function queryRequests(accessToken, fieldPath, value) {
  const url = "https://firestore.googleapis.com/v1/projects/pcls-portal/databases/(default)/documents:runQuery";
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "cereri" }],
      where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: firestoreValue(value) } }
    } })
  });
  if (!response.ok) return [];
  const rows = await response.json().catch(() => []);
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => row.document).map(row => {
    const document = row.document;
    const id = String(document.name || "").split("/").pop();
    return { id, col: "cereri", ...decodeFields(document.fields || {}) };
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return send(res, 405, { ok: false, error: "Method Not Allowed" });
  const session = readSession(req);
  if (!session) return send(res, 401, { ok: false, error: "Nu ești autentificat cu Discord." });

  try {
    const sa = await serviceAccount();
    const accessToken = await googleAccessToken(sa);
    const discordId = String(session.discordId);
    const fields = ["discord", "discord_id", "discordId"];
    const results = await Promise.all(fields.map(field => queryRequests(accessToken, field, discordId)));
    const unique = new Map();
    for (const list of results) for (const item of list) unique.set(item.id, item);
    const requests = Array.from(unique.values()).sort((a, b) => {
      const ta = Date.parse(String(a.created_at || a.data_creare || a.createdAt || a.data || "")) || 0;
      const tb = Date.parse(String(b.created_at || b.data_creare || b.createdAt || b.data || "")) || 0;
      return tb - ta;
    });

    return send(res, 200, {
      ok: true,
      user: {
        discordId: discordId,
        name: String(session.name || "Utilizator Discord"),
        email: String(session.email || "")
      },
      requests
    });
  } catch (error) {
    console.error("My requests error:", error);
    return send(res, 500, { ok: false, error: "Nu s-au putut încărca cererile." });
  }
};
