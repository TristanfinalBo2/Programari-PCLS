const crypto = require("crypto");

const PROJECT_ID = "pcls-portal";
const ALLOWED_ORIGINS = new Set([
  "https://programari-pcls.vercel.app",
  "https://programari-pcls.vercel.app/"
]);
const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_FIELDS = 120;
const MAX_STRING = 4000;
const MAX_PAYLOAD = 60000;

function json(res, status, body) {
  return res.status(status).json(body);
}

function b64(value) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(header, payload, privateKey) {
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  const signature = crypto.createSign("RSA-SHA256").update(input).end().sign(privateKey);
  return `${input}.${signature.toString("base64url")}`;
}

function firestoreValue(value, depth = 0) {
  if (depth > 8) return { stringValue: String(value ?? "") .slice(0, MAX_STRING) };
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value.slice(0, MAX_STRING) };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.slice(0, 100).map(item => firestoreValue(item, depth + 1)) } };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_FIELDS)) {
      if (BLOCKED_KEYS.has(key)) continue;
      fields[key] = firestoreValue(item, depth + 1);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value).slice(0, MAX_STRING) };
}

function encodeFields(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data).slice(0, MAX_FIELDS)) {
    if (BLOCKED_KEYS.has(key)) continue;
    fields[key] = firestoreValue(value);
  }
  return fields;
}

async function getServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON lipsește.");
  const sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON invalid.");
  return sa;
}

async function getAccessToken(sa) {
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
  if (!response.ok || !data.access_token) throw new Error(`Google token indisponibil (${response.status}).`);
  return data.access_token;
}

async function createDocument(token, data) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/cereri`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields: encodeFields(data) })
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `Firestore create failed (${response.status}).`);
  return body;
}

function cleanString(value, max = MAX_STRING) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeSubmittedData(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out = {};
  for (const [key, value] of Object.entries(source).slice(0, MAX_FIELDS)) {
    if (BLOCKED_KEYS.has(key)) continue;
    out[key] = value;
  }

  if (!out.status) out.status = "in_asteptare";
  if (out.arhivat === undefined) out.arhivat = false;
  if (out.deleted === undefined) out.deleted = false;
  if (!out.created_at) out.created_at = new Date().toISOString();
  if (!out.data_creare) out.data_creare = new Date().toISOString();
  out.submitted_via = "public_form_server";
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");

  const origin = cleanString(req.headers.origin || "");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { ok: false, error: "Origine nepermisă." });
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method Not Allowed" });

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (cleanString(body.website, 100)) return json(res, 200, { ok: true });

    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
      return json(res, 400, { ok: false, error: "Date formular lipsă sau invalide." });
    }

    let serialized;
    try { serialized = JSON.stringify(body.data); } catch { return json(res, 400, { ok: false, error: "Datele formularului nu pot fi procesate." }); }
    if (serialized.length > MAX_PAYLOAD) return json(res, 413, { ok: false, error: "Formularul este prea mare." });

    const document = normalizeSubmittedData(body.data);
    const token = await getAccessToken(await getServiceAccount());
    const created = await createDocument(token, document);

    return json(res, 200, {
      ok: true,
      id: String(created?.name || "").split("/").pop() || null
    });
  } catch (error) {
    console.error("/api/submit-public-request error:", error);
    return json(res, 500, { ok: false, error: "Cererea nu a putut fi salvată." });
  }
};
