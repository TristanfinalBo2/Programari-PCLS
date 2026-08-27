const crypto = require("crypto");
const SESSION_COOKIE = "pcls_discord_session";
const MAX_AGE = 60 * 60 * 24 * 7;

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
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new Error("Lipsește FIREBASE_SERVICE_ACCOUNT_JSON în Vercel.");
  const sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON este invalid.");

  const now = Math.floor(Date.now() / 1000);
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
  return data.access_token;
}

async function findUserProfile(accessToken, discordId, email) {
  const base = "https://firestore.googleapis.com/v1/projects/pcls-portal/databases/(default)/documents:runQuery";
  const values = [
    ["discordId", discordId],
    ["discord", discordId],
    ["discord_id", discordId]
  ];
  if (email) values.push(["email", email]);

  for (const [fieldPath, value] of values) {
    const response = await fetch(base, {
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
              value: { stringValue: String(value) }
            }
          },
          limit: 1
        }
      })
    });

    if (!response.ok) continue;
    const rows = await response.json().catch(() => []);
    if (Array.isArray(rows)) {
      const row = rows.find(item => item.document);
      if (row?.document) return row.document;
    }
  }

  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  const session = readSession(req);
  if (!session) return res.status(401).json({ ok: false, error: "Nu ești autentificat cu Discord." });

  try {
    const accessToken = await googleAccessToken();
    const profile = await findUserProfile(accessToken, String(session.discordId), String(session.email || "").trim());
    const fields = profile?.fields || {};
    const role = decodeString(fields, "role") || decodeString(fields, "rol") || "user";
    const displayName = decodeString(fields, "nume") || String(session.name || "Utilizator Discord");

    return res.status(200).json({
      ok: true,
      user: {
        discordId: String(session.discordId),
        name: displayName,
        email: String(session.email || ""),
        role
      }
    });
  } catch (error) {
    console.error("Discord session profile error:", error);
    return res.status(200).json({
      ok: true,
      user: {
        discordId: String(session.discordId),
        name: String(session.name || "Utilizator Discord"),
        email: String(session.email || ""),
        role: "user"
      }
    });
  }
};
