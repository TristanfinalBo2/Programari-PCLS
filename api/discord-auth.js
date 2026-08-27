const crypto = require("crypto");

const PROJECT_ID = "pcls-portal";
const FIREBASE_API_KEY = "AIzaSyBst9kibZtc9Cx-KgJ21XcZUkouRtDI1Sc";
const DEFAULT_REDIRECT_URI = "https://programari-pcls.vercel.app/api/discord-auth";

function send(res, status, body, headers = {}) {
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  return res.status(status).json(body);
}

function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signJwt(header, payload, privateKey) {
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createSign("RSA-SHA256").update(input).end().sign(privateKey);
  return `${input}.${signature.toString("base64url")}`;
}

function parseCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const piece of raw.split(";")) {
    const [key, ...rest] = piece.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function setCookie(res, name, value, maxAge = 600) {
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`);
}

function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
}

function allowedOrigin(req) {
  const origin = String(req.headers.origin || "").trim();
  return !origin || origin === "https://programari-pcls.vercel.app" || origin === `https://${req.headers.host}`;
}

function serviceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new Error("Lipsește FIREBASE_SERVICE_ACCOUNT_JSON în Vercel.");
  const data = JSON.parse(raw);
  if (!data.client_email || !data.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON este invalid.");
  return data;
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

async function runQuery(accessToken, fieldPath, value) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "utilizatori" }],
      where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: { stringValue: value } } },
      limit: 1
    } })
  });
  if (!response.ok) throw new Error(`Firestore query failed (${response.status}).`);
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows.find(item => item.document) : null;
  if (!row?.document?.name) return null;
  return row.document;
}

function fieldString(fields, name) {
  return String(fields?.[name]?.stringValue || "");
}

async function findExistingProfile(accessToken, discordId, email) {
  const byDiscord = await runQuery(accessToken, "discordId", discordId).catch(() => null);
  if (byDiscord) return byDiscord;
  if (email) return runQuery(accessToken, "email", email).catch(() => null);
  return null;
}

async function createCustomToken(uid, sa, discord) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: sa.client_email,
      sub: sa.client_email,
      aud: `https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit`,
      iat: now,
      exp: now + 3600,
      uid,
      claims: {
        discordId: discord.id,
        discordUsername: discord.global_name || discord.username || "Utilizator Discord",
        authProvider: "discord"
      }
    },
    sa.private_key.replace(/\\n/g, "\n")
  );
}

function callbackHtml(payload) {
  const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Autentificare Discord</title></head><body style="margin:0;background:#070b14;color:#fff;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh"><p>Se finalizează autentificarea...</p><script>const payload=${serialized};try{if(window.opener&&!window.opener.closed){window.opener.postMessage({type:"PCLS_DISCORD_AUTH",...payload},"https://programari-pcls.vercel.app");setTimeout(()=>window.close(),250);}else{location.replace("/auth.html#discord_token="+encodeURIComponent(payload.token)+"&discord_id="+encodeURIComponent(payload.discordId||"")+"&discord_name="+encodeURIComponent(payload.discordName||""));}}catch(e){document.body.innerHTML="<p>Autentificarea nu s-a putut finaliza. Închide această fereastră și încearcă din nou.</p>";}</script></body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!allowedOrigin(req)) return send(res, 403, { ok: false, error: "Origine nepermisă." });

  const redirectUri = String(process.env.DISCORD_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();
  const clientId = String(process.env.DISCORD_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.DISCORD_CLIENT_SECRET || "").trim();

  if (req.method !== "GET") return send(res, 405, { ok: false, error: "Method Not Allowed" });
  if (!clientId || !clientSecret) return send(res, 503, { ok: false, error: "Discord OAuth nu este configurat în Vercel (DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET)." });

  try {
    const code = String(req.query?.code || "").trim();

    if (!code) {
      const state = crypto.randomBytes(32).toString("hex");
      setCookie(res, "pcls_discord_state", state, 600);
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
    const storedState = parseCookie(req, "pcls_discord_state");
    if (!suppliedState || !storedState || !crypto.timingSafeEqual(Buffer.from(suppliedState), Buffer.from(storedState))) {
      clearCookie(res, "pcls_discord_state");
      return send(res, 400, { ok: false, error: "Verificarea OAuth a eșuat. Încearcă din nou." });
    }
    clearCookie(res, "pcls_discord_state");

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
    const token = await createCustomToken(uid, sa, discord);
    const fields = existing?.fields || {};
    const displayName = String(fieldString(fields, "nume") || discord.global_name || discord.username || "Utilizator Discord").trim();

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(callbackHtml({ ok: true, token, discordId: String(discord.id), discordName: displayName, discordEmail: String(discord.email || ""), linkedExisting: Boolean(existing) }));
  } catch (error) {
    console.error("Discord custom auth error:", error);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(`<script>location.replace('/auth.html?discord_error=${encodeURIComponent(error?.message || "Autentificarea Discord a eșuat.")}');</script>`);
  }
};
