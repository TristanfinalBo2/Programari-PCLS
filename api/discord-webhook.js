const PROJECT_ID = "pcls-portal";
const FIREBASE_API_KEY = "AIzaSyBst9kibTzc9Cx-KgJ21XcZUkouRtDI1Sc";
const ALLOWED_ROLES = new Set(["admin", "superadmin"]);
const WEBHOOK_ENV = {
  isuls: "DISCORD_WEBHOOK_ISULS",
  dsls: "DISCORD_WEBHOOK_DSLS",
  mmls: "DISCORD_WEBHOOK_MMLS",
  ssmls: "DISCORD_WEBHOOK_SSMLS"
};

function sendJson(res, status, body) {
  return res.status(status).json(body);
}

function isAllowedOrigin(req) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return true;
  return origin === "https://programari-pcls.vercel.app" || origin === `https://${req.headers.host}`;
}

async function verifyFirebaseToken(idToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Firebase token verification failed", response.status, detail.slice(0, 500));
    throw new Error("Sesiunea Firebase nu a putut fi verificată.");
  }

  const data = await response.json();
  const user = Array.isArray(data.users) ? data.users[0] : null;

  if (!user?.localId) {
    throw new Error("Sesiunea Firebase este invalidă.");
  }

  return { uid: user.localId };
}

async function getUserProfile(uid, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/utilizatori/${encodeURIComponent(uid)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Firestore profile verification failed", response.status, detail.slice(0, 500));
    throw new Error("Profilul utilizatorului nu a putut fi verificat.");
  }

  const data = await response.json();
  const fields = data.fields || {};
  const role = fields.role?.stringValue || fields.rol?.stringValue || "";

  return {
    role: String(role).trim().toLowerCase()
  };
}

function webhookForDepartment(department) {
  const envName = WEBHOOK_ENV[department];
  return envName ? process.env[envName] || "" : "";
}

function sanitizeEmbed(embed) {
  if (!embed || typeof embed !== "object") return null;

  const fields = Array.isArray(embed.fields)
    ? embed.fields.slice(0, 25)
        .map(field => ({
          name: String(field?.name || "").slice(0, 256),
          value: String(field?.value || "-").slice(0, 1024),
          inline: Boolean(field?.inline)
        }))
        .filter(field => field.name && field.value)
    : [];

  return {
    title: String(embed.title || "Programare PCLS").slice(0, 256),
    description: String(embed.description || "").slice(0, 4096),
    color: Number.isFinite(Number(embed.color)) ? Number(embed.color) : 3447003,
    fields,
    footer: embed.footer?.text
      ? { text: String(embed.footer.text).slice(0, 2048) }
      : undefined,
    timestamp: embed.timestamp || new Date().toISOString()
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");

  if (!isAllowedOrigin(req)) {
    return sendJson(res, 403, { ok: false, error: "Origine nepermisă." });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method Not Allowed" });
  }

  try {
    const authorization = String(req.headers.authorization || "");
    if (!authorization.startsWith("Bearer ")) {
      return sendJson(res, 401, { ok: false, error: "Autentificare necesară." });
    }

    const idToken = authorization.slice(7).trim();
    if (!idToken) {
      return sendJson(res, 401, { ok: false, error: "Token Firebase lipsă." });
    }

    const { uid } = await verifyFirebaseToken(idToken);
    const profile = await getUserProfile(uid, idToken);

    if (!ALLOWED_ROLES.has(profile.role)) {
      return sendJson(res, 403, {
        ok: false,
        error: "Nu ai permisiunea de a trimite mesaje Discord din Admin Panel."
      });
    }

    const body = req.body || {};
    const department = String(body.department || "").trim().toLowerCase();
    const content = String(body.content || "").trim();
    const roleId = String(body.roleId || "").trim();
    const roleMention = String(body.roleMention || "").trim();

    if (!WEBHOOK_ENV[department]) {
      return sendJson(res, 400, { ok: false, error: "Departament invalid." });
    }

    if (!content) {
      return sendJson(res, 400, { ok: false, error: "Mesajul Discord este gol." });
    }

    if (content.length > 2000) {
      return sendJson(res, 400, {
        ok: false,
        error: "Mesajul Discord depășește limita permisă."
      });
    }

    const webhook = webhookForDepartment(department);
    if (!webhook) {
      return sendJson(res, 503, {
        ok: false,
        error: `Webhook-ul pentru ${department.toUpperCase()} nu este configurat în Vercel.`
      });
    }

    const embed = sanitizeEmbed(body.embed);
    const discordBody = {
      content: roleMention || content,
      allowed_mentions: roleId ? { roles: [roleId] } : { parse: [] }
    };

    if (embed) {
      discordBody.embeds = [embed];
    }

    const discordResponse = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordBody)
    });

    if (!discordResponse.ok) {
      const detail = await discordResponse.text().catch(() => "");
      console.error(
        "Discord webhook failed",
        department,
        discordResponse.status,
        detail.slice(0, 500)
      );

      return sendJson(res, 502, {
        ok: false,
        error: `Discord a refuzat mesajul (HTTP ${discordResponse.status}).`
      });
    }

    return sendJson(res, 200, { ok: true, department, uid });
  } catch (error) {
    console.error("/api/discord-webhook error:", error);
    return sendJson(res, 500, {
      ok: false,
      error: error?.message || "Eroare internă."
    });
  }
}
