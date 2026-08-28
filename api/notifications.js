const crypto = require("crypto");
const PROJECT_ID = "pcls-portal";
const SESSION_COOKIE = "pcls_discord_session";

function json(res, status, body) { return res.status(status).json(body); }
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
    if (!payload?.discordId || !payload?.exp || payload.exp <= now) return null;
    return payload;
  } catch { return null; }
}
function fv(v) {
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number" && Number.isFinite(v)) return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v ?? "") };
}
function decode(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v.stringValue !== undefined) out[k] = v.stringValue;
    else if (v.integerValue !== undefined) out[k] = Number(v.integerValue);
    else if (v.doubleValue !== undefined) out[k] = v.doubleValue;
    else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
    else if (v.timestampValue !== undefined) out[k] = v.timestampValue;
    else if (v.nullValue !== undefined) out[k] = null;
  }
  return out;
}
function encodeFields(obj = {}) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = fv(v);
  return fields;
}
function b64(v) { return Buffer.from(v).toString("base64url"); }
function signJwt(h, p, key) {
  const input = `${b64(JSON.stringify(h))}.${b64(JSON.stringify(p))}`;
  const sig = crypto.createSign("RSA-SHA256").update(input).end().sign(key);
  return `${input}.${sig.toString("base64url")}`;
}
async function accessToken() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON lipsește.");
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({ alg: "RS256", typ: "JWT" }, {
    iss: sa.client_email, sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore"
  }, String(sa.private_key).replace(/\\n/g, "\n"));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString()
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error("Token Firebase indisponibil.");
  return d.access_token;
}
async function queryByField(token, fieldPath, value, limit = 50) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "notificari" }],
      where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: fv(value) } },
      orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
      limit
    }})
  });
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) ? rows.filter(x => x.document).map(x => ({ id: String(x.document.name).split("/").pop(), ...decode(x.document.fields || {}) })) : [];
}
async function queryUserProfileId(token, discordId, email) {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const checks = [["discordId", discordId], ["discord_id", discordId], ["discord", discordId]];
  if (email) checks.push(["email", email]);
  for (const [fieldPath, value] of checks) {
    const r = await fetch(base, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: "utilizatori" }],
        where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: fv(value) } },
        limit: 1
      }})
    });
    if (!r.ok) continue;
    const rows = await r.json().catch(() => []);
    const doc = Array.isArray(rows) ? rows.find(x => x.document)?.document : null;
    if (doc?.name) return String(doc.name).split("/").pop();
  }
  return "";
}
async function patchNotification(token, id, data) {
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/notificari/${encodeURIComponent(id)}`);
  for (const k of Object.keys(data)) url.searchParams.append("updateMask.fieldPaths", k);
  const r = await fetch(url, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: encodeFields(data) }) });
  if (!r.ok) throw new Error("Nu s-a putut actualiza notificarea.");
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const session = readSession(req);
  if (!session) return json(res, 401, { ok: false, error: "Nu ești autentificat cu Discord." });
  try {
    const token = await accessToken();
    const discordId = String(session.discordId);
    const email = String(session.email || "");

    const queries = [
      queryByField(token, "recipientDiscordId", discordId, 50),
      queryByField(token, "recipientId", discordId, 50)
    ];
    if (email) queries.push(queryByField(token, "recipientEmail", email, 50));
    const profileId = await queryUserProfileId(token, discordId, email);
    if (profileId) queries.push(queryByField(token, "recipientId", profileId, 50));

    const lists = await Promise.all(queries);
    const unique = new Map();
    for (const list of lists) for (const item of list) unique.set(item.id, item);
    const items = Array.from(unique.values()).sort((a, b) => {
      const ta = Date.parse(String(a.createdAt || "")) || 0;
      const tb = Date.parse(String(b.createdAt || "")) || 0;
      return tb - ta;
    });

    if (req.method === "POST") {
      const body = typeof req.body === "object" && req.body ? req.body : {};
      if (body.action === "readAll") {
        for (const item of items.filter(x => x.read !== true)) await patchNotification(token, item.id, { read: true });
        return json(res, 200, { ok: true });
      }
      const id = String(body.id || "");
      if (!id) return json(res, 400, { ok: false, error: "ID notificare lipsă." });
      const allowed = items.find(x => x.id === id);
      if (!allowed) return json(res, 404, { ok: false, error: "Notificarea nu există." });
      if (body.action === "read") await patchNotification(token, id, { read: true });
      return json(res, 200, { ok: true });
    }
    if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method Not Allowed" });
    return json(res, 200, { ok: true, notifications: items });
  } catch (e) {
    console.error("notifications error", e);
    return json(res, 500, { ok: false, error: e?.message || "Eroare server." });
  }
};
