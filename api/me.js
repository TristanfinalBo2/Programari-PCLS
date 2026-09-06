const crypto = require("crypto");
const SESSION_COOKIE = "pcls_discord_session";
const MAX_AGE = 60 * 60 * 24 * 7;
const PROJECT_ID = "pcls-portal";

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
  } catch (_) { return null; }
}
function decode(fields = {}) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value.stringValue !== undefined) out[key] = value.stringValue;
    else if (value.integerValue !== undefined) out[key] = Number(value.integerValue);
    else if (value.doubleValue !== undefined) out[key] = value.doubleValue;
    else if (value.booleanValue !== undefined) out[key] = value.booleanValue;
    else if (value.timestampValue !== undefined) out[key] = value.timestampValue;
    else if (value.nullValue !== undefined) out[key] = null;
  }
  return out;
}
function fv(value) {
  if (value === null || value === undefined) return { nullValue: "NULL_VALUE" };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value)) return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
}
function encodeFields(data = {}) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, fv(value)]));
}
function b64(value) { return Buffer.from(value).toString("base64url"); }
async function googleAccessToken() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new Error("Lipsește FIREBASE_SERVICE_ACCOUNT_JSON în Vercel.");
  const sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON este invalid.");
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64(JSON.stringify({ iss: sa.client_email, sub: sa.client_email, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, scope: "https://www.googleapis.com/auth/datastore" }));
  const input = `${header}.${payload}`;
  const signature = crypto.createSign("RSA-SHA256").update(input).end().sign(sa.private_key.replace(/\\n/g, "\n"));
  const assertion = `${input}.${signature.toString("base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error("Nu s-a putut obține tokenul Google pentru Firebase Admin.");
  return data.access_token;
}
async function queryProfile(token, discordId, email) {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const checks = [["discordId", discordId], ["discord_id", discordId], ["discord", discordId]];
  if (email) checks.push(["email", email]);
  for (const [fieldPath, value] of checks) {
    if (!value) continue;
    const response = await fetch(base, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "utilizatori" }], where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: fv(value) } }, limit: 1 } })
    });
    if (!response.ok) continue;
    const rows = await response.json().catch(() => []);
    const hit = Array.isArray(rows) ? rows.find(x => x.document) : null;
    if (hit?.document) return { id: String(hit.document.name).split("/").pop(), ...decode(hit.document.fields || {}) };
  }
  return null;
}
async function patchProfile(token, id, data) {
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/utilizatori/${encodeURIComponent(id)}`);
  for (const key of Object.keys(data)) url.searchParams.append("updateMask.fieldPaths", key);
  const response = await fetch(url, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: encodeFields(data) }) });
  if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err?.error?.message || `Firestore ${response.status}`); }
}
async function createProfile(token, id, data) {
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/utilizatori`);
  url.searchParams.set("documentId", id);
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: encodeFields(data) }) });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const message = err?.error?.message || `Firestore create ${response.status}`;
    if (response.status === 409 || /already exists|already exists/i.test(message)) {
      await patchProfile(token, id, data);
      return;
    }
    throw new Error(message);
  }
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  const session = readSession(req);
  if (!session) return res.status(401).json({ ok: false, error: "Nu ești autentificat cu Discord." });
  try {
    const token = await googleAccessToken();
    const discordId = String(session.discordId);
    const email = String(session.email || "").trim();
    let profile = await queryProfile(token, discordId, email);
    const nowIso = new Date().toISOString();
    if (!profile) {
      const id = `discord_${discordId}`;
      const username = String(session.username || session.name || "Utilizator Discord");
      const data = {
        discordId, discord_id: discordId, username, globalName: String(session.globalName || username),
        nume: username, name: username, email, role: null, rol: null,
        active: true, activ: true, enabled: true, authProvider: "discord",
        createdAt: nowIso, ultimaLogare: nowIso, lastLogin: nowIso,
        lastSeen: nowIso, authSource: "discord-cookie"
      };
      await createProfile(token, id, data);
      profile = { id, ...data };
    } else {
      try {
        await patchProfile(token, profile.id, {
          ultimaLogare: nowIso,
          lastLogin: nowIso,
          lastSeen: nowIso,
          discordId,
          discord_id: discordId,
          username: String(session.username || session.name || profile.username || "Utilizator Discord"),
          globalName: String(session.globalName || session.username || profile.globalName || "Utilizator Discord"),
          authProvider: profile.authProvider || "discord",
          authSource: "discord-cookie"
        });
      } catch (_) {}
    }
    const username = String(session.username || session.name || profile.nume || "Utilizator Discord");
    const role = profile.role ?? profile.rol ?? "user";
    return res.status(200).json({ ok: true, user: { uid: profile.id, discordId, name: String(profile.nume || profile.name || username), username, globalName: String(session.globalName || username), email, role } });
  } catch (error) {
    console.error("Discord session profile error:", error);
    return res.status(200).json({ ok: true, user: { uid: null, discordId: String(session.discordId), name: String(session.username || session.name || "Utilizator Discord"), username: String(session.username || session.name || "Utilizator Discord"), globalName: String(session.globalName || session.username || "Utilizator Discord"), email: String(session.email || ""), role: "user" } });
  }
};
