const PROJECT_ID = "pcls-portal";
const ALLOWED_ROLES = new Set(["admin", "superadmin"]);
const WEBHOOK_ENV = {
  isuls: "DISCORD_WEBHOOK_ISULS",
  dsls: "DISCORD_WEBHOOK_DSLS",
  mmls: "DISCORD_WEBHOOK_MMLS",
  ssmls: "DISCORD_WEBHOOK_SSMLS"
};
const DISCORD_ROLE_IDS = {
  isuls: "956186666593296422",
  dsls: "956186666593296421",
  mmls: "1108121643571757126",
  ssmls: "1461105499276574911"
};

function sendJson(res, status, body) { return res.status(status).json(body); }
function isAllowedOrigin(req) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return true;
  return origin === "https://programari-pcls.vercel.app" || origin === `https://${req.headers.host}`;
}
function decodeJwtPayload(idToken) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Tokenul Firebase este invalid.");
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch { throw new Error("Tokenul Firebase este invalid."); }
}
async function verifyFirebaseToken(idToken) {
  const payload = decodeJwtPayload(idToken);
  const uid = String(payload.user_id || payload.sub || "").trim();
  const audience = String(payload.aud || "").trim();
  const issuer = String(payload.iss || "").trim();
  if (!uid) throw new Error("Tokenul Firebase nu conține UID.");
  if (audience !== PROJECT_ID) throw new Error("Tokenul Firebase nu aparține proiectului pcls-portal.");
  if (issuer !== `https://securetoken.google.com/${PROJECT_ID}`) throw new Error("Emitentul tokenului Firebase este invalid.");
  return { uid };
}
async function getUserProfile(uid, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/utilizatori/${encodeURIComponent(uid)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Sesiunea Firebase este expirată sau invalidă. Reîncarcă pagina și autentifică-te din nou.");
    if (response.status === 403) throw new Error("Firebase a refuzat accesul la profilul utilizatorului. Verifică regulile Firestore pentru utilizatori.");
    if (response.status === 404) throw new Error("Profilul utilizatorului nu există în colecția utilizatori.");
    throw new Error(`Profilul utilizatorului nu a putut fi verificat (HTTP ${response.status}).`);
  }
  const data = await response.json();
  const fields = data.fields || {};
  const role = fields.role?.stringValue || fields.rol?.stringValue || "";
  return { role: String(role).trim().toLowerCase() };
}
function webhookForDepartment(department) {
  const envName = WEBHOOK_ENV[department];
  return envName ? process.env[envName] || "" : "";
}
function sanitizeEmbed(embed) {
  if (!embed || typeof embed !== "object") return null;
  const fields = Array.isArray(embed.fields)
    ? embed.fields.slice(0, 25).map(field => ({
        name: String(field?.name || "").slice(0, 256),
        value: String(field?.value || "-").slice(0, 1024),
        inline: Boolean(field?.inline)
      })).filter(field => field.name && field.value)
    : [];
  return {
    title: String(embed.title || "Programare PCLS").slice(0, 256),
    description: String(embed.description || "").slice(0, 4096),
    color: Number.isFinite(Number(embed.color)) ? Number(embed.color) : 3447003,
    fields,
    footer: embed.footer?.text ? { text: String(embed.footer.text).slice(0, 2048) } : undefined,
    timestamp: embed.timestamp || new Date().toISOString()
  };
}
function decodeImageDataUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) return null;
  if (buffer.length > 8 * 1024 * 1024) throw new Error("Imaginea locației este prea mare pentru trimiterea pe Discord.");
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : mimeType.includes("gif") ? "gif" : "jpg";
  return { buffer, mimeType, filename: `locatie.${extension}` };
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
    if (!idToken) return sendJson(res, 401, { ok: false, error: "Token Firebase lipsă." });
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
    const roleId = DISCORD_ROLE_IDS[department];
    const roleMention = `<@&${roleId}>`;
    const embed = sanitizeEmbed(body.embed);
    const image = decodeImageDataUrl(body.locationImage);
    const discordPayload = { content: `${roleMention}\n${content}`, allowed_mentions: { roles: [roleId] } };
    if (embed) discordPayload.embeds = [embed];

    let discordResponse;
    if (image) {
      const form = new FormData();
      form.append("payload_json", JSON.stringify(discordPayload));
      form.append("files[0]", new Blob([image.buffer], { type: image.mimeType }), image.filename);
      discordResponse = await fetch(webhook, { method: "POST", body: form });
    } else {
      discordResponse = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload)
      });
    }
    if (!discordResponse.ok) {
      const detail = await discordResponse.text().catch(() => "");
      console.error("Discord webhook failed", department, discordResponse.status, detail.slice(0, 500));
      return sendJson(res, 502, { ok: false, error: `Discord a refuzat mesajul (HTTP ${discordResponse.status}).` });
    }
    return sendJson(res, 200, { ok: true, department, uid, roleId, imageAttached: Boolean(image) });
  } catch (error) {
    console.error("/api/discord-webhook error:", error);
    return sendJson(res, 500, { ok: false, error: error?.message || "Eroare internă." });
  }
}
