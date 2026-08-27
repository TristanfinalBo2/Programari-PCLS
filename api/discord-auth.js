const crypto = require("crypto");

const DEFAULT_REDIRECT_URI = "https://programari-pcls.vercel.app/api/discord-auth";
const SESSION_COOKIE = "pcls_discord_session";
const STATE_COOKIE = "pcls_discord_state";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(name) {
  return `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function parseCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function encodeSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

function callbackPage(error = "") {
  const destination = error
    ? `/auth.html?discord_error=${encodeURIComponent(error)}`
    : "/index.html";
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Autentificare Discord</title></head><body><script>window.location.replace(${JSON.stringify(destination)});</script></body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  const clientId = String(process.env.DISCORD_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.DISCORD_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.DISCORD_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();

  if (!clientId || !clientSecret) {
    return res.status(503).json({ ok: false, error: "Discord OAuth nu este configurat în Vercel." });
  }

  try {
    const code = String(req.query?.code || "").trim();

    if (!code) {
      const state = crypto.randomBytes(32).toString("hex");
      res.setHeader("Set-Cookie", cookie(STATE_COOKIE, state, 600));
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
      res.setHeader("Set-Cookie", clearCookie(STATE_COOKIE));
      return res.status(400).send(callbackPage("Verificarea OAuth a eșuat. Încearcă din nou."));
    }

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      }).toString()
    });

    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error("Discord nu a acceptat codul de autorizare.");
    }

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const discord = await userResponse.json().catch(() => ({}));
    if (!userResponse.ok || !discord.id) {
      throw new Error("Profilul Discord nu a putut fi citit.");
    }

    const now = Math.floor(Date.now() / 1000);
    const session = encodeSession({
      discordId: String(discord.id),
      name: String(discord.global_name || discord.username || "Utilizator Discord"),
      email: String(discord.email || ""),
      iat: now,
      exp: now + SESSION_MAX_AGE
    }, clientSecret);

    res.setHeader("Set-Cookie", [
      clearCookie(STATE_COOKIE),
      cookie(SESSION_COOKIE, session, SESSION_MAX_AGE)
    ]);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(callbackPage());
  } catch (error) {
    console.error("Discord cookie auth error:", error);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(callbackPage(error?.message || "Autentificarea Discord a eșuat."));
  }
};