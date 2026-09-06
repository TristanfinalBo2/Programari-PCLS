const crypto = require("crypto");

const PROJECT_ID = "pcls-portal";
const SESSION_COOKIE = "pcls_discord_session";
const MAX_AGE = 60 * 60 * 24 * 7;
const ADMIN_ROLES = new Set(["admin", "superadmin"]);
const VALID_ROLES = new Set(["admin", "superadmin", "conducere", "isuls", "dsls", "mmls", "ssmls"]);

function json(res, status, body) {
  return res.status(status).json(body);
}

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

function fv(value) {
  if (value === null || value === undefined) return { nullValue: "NULL_VALUE" };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: String(value) };
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

function encodeFields(data = {}) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, fv(value)]));
}

function b64(value) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(header, payload, key) {
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  const sig = crypto.createSign("RSA-SHA256").update(input).end().sign(key);
  return `${input}.${sig.toString("base64url")}`;
}

async function getGoogleToken() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON lipsește.");
  const sa = JSON.parse(raw);
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
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error("Token Firebase Admin indisponibil.");
  return data.access_token;
}

async function queryUsers(token, fieldPath, value) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "utilizatori" }],
        where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: fv(value) } },
        limit: 1
      }
    })
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  const hit = Array.isArray(rows) ? rows.find(row => row.document) : null;
  return hit?.document ? { id: String(hit.document.name).split("/").pop(), ...decode(hit.document.fields || {}) } : null;
}

async function getAllUsers(token) {
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/utilizatori`);
  url.searchParams.set("pageSize", "1000");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Firestore ${response.status}`);
  return (data.documents || []).map(document => ({
    uid: String(document.name).split("/").pop(),
    ...decode(document.fields || {})
  }));
}

async function patchUser(token, uid, data) {
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/utilizatori/${encodeURIComponent(uid)}`);
  for (const key of Object.keys(data)) url.searchParams.append("updateMask.fieldPaths", key);
  const response = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFields(data) })
  });
  if (!response.ok) {
    const dataError = await response.json().catch(() => ({}));
    throw new Error(dataError?.error?.message || `Firestore update ${response.status}`);
  }
}

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (role === "conducerea") return "conducere";
  if (role === "mm" || role === "mmlls") return "mmls";
  if (role === "ssmmls") return "ssmls";
  return role;
}

async function authorize(token, session) {
  let profile = null;
  const discordId = String(session.discordId || "").trim();
  const email = String(session.email || "").trim();
  if (discordId) profile = await queryUsers(token, "discordId", discordId);
  if (!profile && email) profile = await queryUsers(token, "email", email);
  const role = normalizeRole(profile?.role || profile?.rol || session.role || "");
  return { ok: ADMIN_ROLES.has(role), role, profile };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const session = readSession(req);
  if (!session) return json(res, 401, { ok: false, error: "Nu ești autentificat cu Discord." });

  try {
    const token = await getGoogleToken();
    const auth = await authorize(token, session);
    if (!auth.ok) return json(res, 403, { ok: false, error: "Nu ai permisiunea de a gestiona utilizatori." });

    if (req.method === "GET") {
      const users = await getAllUsers(token);
      users.sort((a, b) => String(a.nume || a.name || a.email || a.uid).localeCompare(String(b.nume || b.name || b.email || b.uid), "ro"));
      return json(res, 200, {
        ok: true,
        user: { uid: auth.profile?.id || null, name: auth.profile?.nume || auth.profile?.name || session.username || "Admin", role: auth.role },
        users
      });
    }

    if (req.method !== "PATCH") return json(res, 405, { ok: false, error: "Method Not Allowed" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const uid = String(body.uid || "").trim();
    if (!uid) return json(res, 400, { ok: false, error: "UID lipsă." });
    if (uid === auth.profile?.id) return json(res, 400, { ok: false, error: "Nu îți poți modifica propriul rol din această zonă." });

    const target = (await getAllUsers(token)).find(user => user.uid === uid);
    if (!target) return json(res, 404, { ok: false, error: "Utilizatorul nu există." });

    const newRoleRaw = body.role;
    const newRole = newRoleRaw === null || String(newRoleRaw).trim() === "" ? null : normalizeRole(newRoleRaw);
    if (newRole !== null && !VALID_ROLES.has(newRole)) return json(res, 400, { ok: false, error: "Role invalid." });

    const targetRole = normalizeRole(target.role || target.rol || "");
    if (targetRole === "superadmin" && auth.role !== "superadmin") {
      return json(res, 403, { ok: false, error: "Doar un superadmin poate modifica un superadmin." });
    }
    if (newRole === "superadmin" && auth.role !== "superadmin") {
      return json(res, 403, { ok: false, error: "Doar un superadmin poate acorda rolul superadmin." });
    }

    const updates = {
      role: newRole,
      rol: newRole,
      updatedAt: new Date().toISOString(),
      updatedBy: String(auth.profile?.nume || auth.profile?.name || session.username || "Admin")
    };
    await patchUser(token, uid, updates);

    return json(res, 200, { ok: true, uid, role: newRole });
  } catch (error) {
    console.error("user-management error", error);
    return json(res, 500, { ok: false, error: error?.message || "Eroare server." });
  }
};
