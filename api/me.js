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
  } catch (_) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  const session = readSession(req);
  if (!session) return res.status(401).json({ ok: false, error: "Nu ești autentificat cu Discord." });
  return res.status(200).json({ ok: true, user: {
    discordId: String(session.discordId),
    name: String(session.name || "Utilizator Discord"),
    email: String(session.email || "")
  }});
};
