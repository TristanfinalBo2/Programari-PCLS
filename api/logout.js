const SESSION_COOKIE = "pcls_discord_session";
const STATE_COOKIE = "pcls_discord_state";

function clearCookie(name) {
  return `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Set-Cookie", [clearCookie(SESSION_COOKIE), clearCookie(STATE_COOKIE)]);
  if (req.method === "GET") return res.redirect(302, "/auth.html");
  return res.status(200).json({ ok: true });
};
