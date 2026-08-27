const crypto = require("crypto");

const PROJECT_ID = "pcls-portal";
const ALLOWED_ORIGINS = new Set([
  "https://programari-pcls.vercel.app",
  "https://programari-pcls.vercel.app/"
]);

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

function fv(value) {
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: String(value ?? "") };
}

function encodeFields(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) fields[key] = fv(value);
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
  if (!response.ok || !data.access_token) {
    throw new Error(`Google token indisponibil (${response.status}).`);
  }
  return data.access_token;
}

async function createDocument(token, collectionId, data) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}`,
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
  if (!response.ok) {
    throw new Error(body?.error?.message || `Firestore create failed (${response.status}).`);
  }
  return body;
}

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");

  const origin = String(req.headers.origin || "").trim();
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json(res, 403, { ok: false, error: "Origine nepermisă." });
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method Not Allowed" });
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};

    // Honeypot anti-bot: formularul real nu completează acest câmp.
    if (clean(body.website, 100)) {
      return json(res, 200, { ok: true });
    }

    const discordId = clean(body.discordId, 32);
    if (!/^\d{17,20}$/.test(discordId)) {
      return json(res, 400, { ok: false, error: "ID Discord invalid." });
    }

    const nume = clean(body.nume, 200) || "-";
    const numeAfacere = clean(body.numeAfacere, 200) || "-";
    const tipSpatiu = clean(body.tipSpatiu, 200) || "-";
    const tel = clean(body.tel, 50) || "-";
    const dataProgramare = clean(body.dataProgramare, 50) || "-";
    const oraProgramare = clean(body.oraProgramare, 50) || "-";
    const detalii = clean(body.detalii, 2000) || "Fără detalii";

    const token = await getAccessToken(await getServiceAccount());

    const document = {
      tip_cerere: "Programare",
      departament: "pcls",
      nume,
      proprietar: nume,
      unitate: numeAfacere,
      numeAfacere,
      tipSpatiu,
      tel,
      dataProgramare,
      oraProgramare,
      discord: discordId,
      discordId,
      detalii,
      status: "in_asteptare",
      arhivat: false,
      deleted: false,
      created_at: new Date().toISOString(),
      data_creare: new Date().toISOString()
    };

    const created = await createDocument(token, "cereri", document);

    return json(res, 200, {
      ok: true,
      id: String(created?.name || "").split("/").pop() || null
    });
  } catch (error) {
    console.error("/api/submit-public-request error:", error);
    return json(res, 500, { ok: false, error: "Cererea nu a putut fi salvată." });
  }
};
