const crypto = require("crypto");

const DEFAULT_REDIRECT_URI = "https://programari-pcls.vercel.app/api/discord-auth";
const SESSION_COOKIE = "pcls_discord_session";
const STATE_COOKIE = "pcls_discord_state";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function send(res, status, body, headers = {}) {
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  return res.status(status).json(body);
}

function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\\+/g, "-").replace(/\\//g, "_");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function encodeSession(payload, secret) {
  const body = base64Url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

function setCookieHeader(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookieHeader(name) {
  return `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function parseCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const piece of raw.split(";")) {
    const [key, ...rest] = piece.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function serviceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new Error("Lipsește FIREBASE_SERVICE_ACCOUNT_JSON în Vercel.");
  const data = JSON.parse(raw);
  if (!data.client_email || !data.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON este invalid.");
  return data;
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
    sa.private_key.replace(/\\\\n/g, "\\n")
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

async function runQuery(accessToken, fieldPath, value) {
  const url = "https://firestore.googleapis.com/v1/projects/pcls-portal/databases/(default)/documents:runQuery";
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "utilizatori" }],
      where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: { stringValue: value } } },
      limit: 1
    } })
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows.find(item => item.document) : null;
  return row?.document || null;
}

function fieldString(fields, name) {
  return String(fields?.[name]?.stringValue || "").trim();
}

async function findExistingProfile(accessToken, discordId, email) {
  const byDiscord = await runQuery(accessToken, "discordId", discordId);
  if (byDiscord) return byDiscord;
  if (email) return runQuery(accessToken, "email", email);
  return null;
}

function callbackHtml(payload) {
  const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Autentificare Discord</title></head><body style="margin:0;background:#070b14;color:#fff;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh"><p>Se finalizează autentificarea...</p><script>const payload=${serialized};try{if(window.opener&&!window.opener.closed){window.opener.postMessage({type:"PCLS_DISCORD_AUTH",...payload},"https://programari-pcls.vercel.app");setTimeout(()=>window.close(),300);}else{location.replace("/index.html");}}catch(e){location.replace("/auth.html?discord_error="+encodeURIComponent(e?.message||"Autentificarea Discord a eșuat."));}</script></body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return send(res, 405, { ok: false, error: "Method Not Allowed" });

  const clientId = String(process.env.DISCORD_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.DISCORD_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.DISCORD_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();
  if (!clientId || !clientSecret) return send(res, 503, { ok: false, error: "Discord OAuth nu este configurat în Vercel (DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET)." });

  try {
    const code = String(req.query?.code || "").trim();
    if (!code) {
      const state = crypto.randomBytes(32).toString("hex");
      res.setHeader("Set-Cookie", setCookieHeader(STATE_COOKIE, state, 600));
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "identify email",
        state,
        prompt: "consent"
      });
      return res.redirect(302, `https://discord.com/oauth2/authorize?${params.toString()}`);
    }

    const suppliedState = String(req.query?.state || "").trim();
    const storedState = parseCookie(req, STATE_COOKIE);
    if (!suppliedState || !storedState || suppliedState !== storedState) {
      res.setHeader("Set-Cookie", clearCookieHeader(STATE_COOKIE));
      return send(res, 400, { ok: false, error: "Verificarea OAuth a eșuat. Încearcă din nou." });
    }

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString()
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error("Discord nu a acceptat codul de autorizare.");

    const userResponse = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const discord = await userResponse.json().catch(() => ({}));
    if (!userResponse.ok || !discord.id) throw new Error("Profilul Discord nu a putut fi citit.");

    const sa = serviceAccount();
    const googleToken = await googleAccessToken(sa);
    const existing = await findExistingProfile(googleToken, String(discord.id), String(discord.email || "").trim());
    const existingUid = existing?.name ? existing.name.split("/").pop() : "";
    const uid = existingUid || `discord_${String(discord.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const profileFields = existing?.fields || {};
    const displayName = String(fieldString(profileFields, "nume") || discord.global_name || discord.username || "Utilizator Discord").trim();

    const session = encodeSession({
      uid,
      discordId: String(discord.id),
      name: displayName,
      email: String(discord.email || ""),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
    }, clientSecret);

    res.setHeader("Set-Cookie", [
      clearCookieHeader(STATE_COOKIE),
      setCookieHeader(SESSION_COOKIE, session, SESSION_MAX_AGE)
    ]);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(callbackHtml({ ok: true, discordId: String(discord.id), discordName: displayName }));
  } catch (error) {
    console.error("Discord cookie auth error:", error);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(`<script>location.replace('/auth.html?discord_error=${encodeURIComponent(error?.message || "Autentificarea Discord a eșuat.")}');</script>`);
  }
};
