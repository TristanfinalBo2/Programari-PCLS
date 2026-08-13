const PROJECT_ID = "pcls-portal";
const FIREBASE_API_KEY = "AIzaSyBst9kibZtc9Cx-KgJ21XcZUkouRtDI1Sc";
const ALLOWED_ROLES = new Set(["admin", "superadmin"]);
const WEBHOOK_ENV = {
  isuls: "DISCORD_WEBHOOK_ISULS",
  dsls: "DISCORD_WEBHOOK_DSLS",
  mmls: "DISCORD_WEBHOOK_MMLS",
  ssmls: "DISCORD_WEBHOOK_SSMLS"
};

function sendJson(res, status, body) {
  res.status(status).json(body);
}

function isAllowedOrigin(req) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return true;
  return origin === "https://programari-pcls.vercel.app" || origin === `https://${req.headers.host}`;
}

async function verifyFirebaseToken(idToken) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  if (!response.ok) throw new Error("Sesiunea Firebase nu a putut fi verificată.");
  const data = await response.json();
  const user = Array.isArray(data.users) ? data.users[0] : null;
  if (!user?.localId) throw new Error("Sesiunea Firebase este invalidă.");
  return { uid: user.localId };
}

async function getUserProfile(uid, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/utilizatori/${encodeURIComponent(uid)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` }
  });
  if (!response.ok) throw new Error("Profilul utilizatorului nu a putut fi verificat.");
  const doc = await response.json();
  const fields = doc.fields || {};
  const role = fields.role?.stringValue || fields.rol?.stringValue || "";
  return { role: String(role).trim().toLowerCase() };
}

function webhookForDepartment(department) {
  const envName = WEBHOOK_ENV[department];
  return envName ? process.env[envName] || "" : "";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");

  if (!isAllowedOrigin(req)) return sendJson(res, 403, { ok: false, error: "Origine nepermisă." });
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method Not Allowed" });

  try {
    const authorization = String(req.headers.authorization || "");
    if (!authorization.startsWith("Bearer ")) return sendJson(res, 401, { ok: false, error: "Autentificare necesară." });

    const idToken = authorization.slice(7).trim();
    const { uid } = await verifyFirebaseToken(idToken);
    const profile = await getUserProfile(uid, idToken);
    if (!ALLOWED_ROLES.has(profile.role)) return sendJson(res, 403, { ok: false, error: "Nu ai permisiunea de a trimite mesaje Discord din Admin Panel." });

    const body = req.body || {};
    const department = String(body.department || "").trim().toLowerCase();
    const content = String(body.content || "").trim();

    if (!WEBHOOK_ENV[department]) return sendJson(res, 400, { ok: false, error: "Departament invalid." });
    if (!content) return sendJson(res, 400, { ok: false, error: "Mesajul Discord este gol." });
    if (content.length > 2000) return sendJson(res, 400, { ok: false, error: "Mesajul Discord depășește limita permisă." });

    const webhook = webhookForDepartment(department);
    if (!webhook) return sendJson(res, 503, { ok: false, error: `Webhook-ul pentru ${department.toUpperCase()} nu este configurat în Vercel.` });

    const discordResponse = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
    });

    if (!discordResponse.ok) {
      const detail = await discordResponse.text().catch(() => "");
      console.error("Discord webhook failed", department, discordResponse.status, detail.slice(0, 500));
      return sendJson(res, 502, { ok: false, error: `Discord a refuzat mesajul (HTTP ${discordResponse.status}).` });
    }

    return sendJson(res, 200, { ok: true, department, uid });
  } catch (error) {
    console.error("/api/discord-webhook error:", error);
    return sendJson(res, 500, { ok: false, error: error?.message || "Eroare internă." });
  }
}
