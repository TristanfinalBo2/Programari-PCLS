from pathlib import Path
import textwrap

ROOT = Path(__file__).resolve().parents[1]

API_AUTH = r'''const crypto = require("crypto");

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
'''

API_REQUESTS = r'''const crypto = require("crypto");

const SESSION_COOKIE = "pcls_discord_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function send(res, status, body) {
  return res.status(status).json(body);
}

function parseCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const piece of raw.split(";")) {
    const [key, ...rest] = piece.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function readSession(req) {
  const raw = parseCookie(req, SESSION_COOKIE);
  const secret = String(process.env.DISCORD_CLIENT_SECRET || "").trim();
  if (!raw || !secret) return null;
  const split = raw.split(".");
  if (split.length !== 2) return null;
  const [body, signature] = split;
  const expected = sign(body, secret);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.discordId || !payload?.exp || payload.exp < now) return null;
    if (payload.exp > now + SESSION_MAX_AGE + 60) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function firestoreValue(value) {
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value)) return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
}

function decodeFields(fields = {}) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value?.stringValue !== undefined) out[key] = value.stringValue;
    else if (value?.integerValue !== undefined) out[key] = Number(value.integerValue);
    else if (value?.doubleValue !== undefined) out[key] = value.doubleValue;
    else if (value?.booleanValue !== undefined) out[key] = value.booleanValue;
    else if (value?.timestampValue !== undefined) out[key] = value.timestampValue;
    else if (value?.nullValue !== undefined) out[key] = null;
    else if (value?.mapValue) out[key] = decodeFields(value.mapValue.fields || {});
    else if (value?.arrayValue) out[key] = (value.arrayValue.values || []).map(item => decodeFields({ value: item }).value);
  }
  return out;
}

async function serviceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new Error("Lipsește FIREBASE_SERVICE_ACCOUNT_JSON în Vercel.");
  const sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON este invalid.");
  return sa;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\\+/g, "-").replace(/\\//g, "_");
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

async function queryRequests(accessToken, fieldPath, value) {
  const url = "https://firestore.googleapis.com/v1/projects/pcls-portal/databases/(default)/documents:runQuery";
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "cereri" }],
      where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: firestoreValue(value) } }
    } })
  });
  if (!response.ok) return [];
  const rows = await response.json().catch(() => []);
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => row.document).map(row => {
    const document = row.document;
    const id = String(document.name || "").split("/").pop();
    return { id, col: "cereri", ...decodeFields(document.fields || {}) };
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return send(res, 405, { ok: false, error: "Method Not Allowed" });
  const session = readSession(req);
  if (!session) return send(res, 401, { ok: false, error: "Nu ești autentificat cu Discord." });

  try {
    const sa = await serviceAccount();
    const accessToken = await googleAccessToken(sa);
    const discordId = String(session.discordId);
    const fields = ["discord", "discord_id", "discordId"];
    const results = await Promise.all(fields.map(field => queryRequests(accessToken, field, discordId)));
    const unique = new Map();
    for (const list of results) for (const item of list) unique.set(item.id, item);
    const requests = Array.from(unique.values()).sort((a, b) => {
      const ta = Date.parse(String(a.created_at || a.data_creare || a.createdAt || a.data || "")) || 0;
      const tb = Date.parse(String(b.created_at || b.data_creare || b.createdAt || b.data || "")) || 0;
      return tb - ta;
    });

    return send(res, 200, {
      ok: true,
      user: {
        discordId: discordId,
        name: String(session.name || "Utilizator Discord"),
        email: String(session.email || "")
      },
      requests
    });
  } catch (error) {
    console.error("My requests error:", error);
    return send(res, 500, { ok: false, error: "Nu s-au putut încărca cererile." });
  }
};
'''

AUTH_DISCORD_BLOCK = r'''        // ==========================================
        // LOGICA DE CONECTARE CU DISCORD - COOKIE SERVER-SIDE
        // ==========================================
        const btnDiscordLogin = document.getElementById('btnDiscordLogin');
        let discordPopup = null;

        window.addEventListener('message', (event) => {
            if (event.origin !== 'https://programari-pcls.vercel.app') return;
            const data = event.data || {};
            if (data.type !== 'PCLS_DISCORD_AUTH') return;

            if (discordPopup && !discordPopup.closed) discordPopup.close();

            if (data.ok) {
                mesajDiv.style.color = "var(--accent-green)";
                mesajDiv.textContent = `Conectat cu succes! Bun venit, ${data.discordName || 'Utilizator Discord'}`;
                setTimeout(() => { window.location.href = 'index.html'; }, 350);
            } else {
                mesajDiv.style.color = "var(--error)";
                mesajDiv.textContent = data.error || 'Autentificarea Discord a eșuat.';
            }
        });

        if (btnDiscordLogin) {
            btnDiscordLogin.addEventListener('click', () => {
                mesajDiv.style.color = "var(--accent-green)";
                mesajDiv.textContent = "Se deschide Discord...";
                const width = 520;
                const height = 760;
                const left = Math.max(0, Math.round((window.screen.width - width) / 2));
                const top = Math.max(0, Math.round((window.screen.height - height) / 2));
                discordPopup = window.open(
                    '/api/discord-auth',
                    'pcls_discord_auth',
                    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
                );
                if (!discordPopup) {
                    window.location.href = '/api/discord-auth';
                    return;
                }
                const timer = setInterval(() => {
                    if (discordPopup.closed) {
                        clearInterval(timer);
                        if (!document.hidden && !location.href.includes('discord_error=')) {
                            mesajDiv.textContent = 'Fereastra Discord a fost închisă.';
                        }
                    }
                }, 600);
            });
        }
'''


def patch_auth():
    path = ROOT / "auth.html"
    content = path.read_text(encoding="utf-8")
    marker = "        // ==========================================\n        // LOGICA DE CONECTARE / ÎNREGISTRARE CU DISCORD"
    start = content.find(marker)
    if start < 0:
        raise SystemExit("Marker auth Discord not found")
    end = content.find("    </script>", start)
    if end < 0:
        raise SystemExit("auth script end not found")
    new_content = content[:start] + AUTH_DISCORD_BLOCK + "\n" + content[end:]
    path.write_text(new_content, encoding="utf-8")


def patch_requests_page():
    path = ROOT / "cererile_mele.html"
    content = path.read_text(encoding="utf-8")
    module_start = content.find('<script type="module">')
    if module_start < 0:
        raise SystemExit("cererile module script not found")
    imports_end = content.find("\n\n    const container", module_start)
    if imports_end < 0:
        raise SystemExit("cererile script imports marker not found")
    content = content[:module_start] + '<script type="module">\n' + content[imports_end+2:]
    marker = "    onAuthStateChanged(auth, user => {"
    start = content.find(marker)
    if start < 0:
        raise SystemExit("cererile auth listener not found")
    script_end = content.find("</script>", start)
    if script_end < 0:
        raise SystemExit("cererile script end not found")
    replacement = '''    async function loadRequests() {
        try {
            const response = await fetch("/api/my-requests", { credentials: "same-origin", cache: "no-store" });
            const data = await response.json().catch(() => ({}));
            if (response.status === 401) {
                window.location.href = "auth.html";
                return;
            }
            if (!response.ok || !data.ok) throw new Error(data.error || "Nu s-au putut încărca cererile.");

            requestsBySource.discord.clear();
            requestsBySource.discord_id.clear();
            for (const request of (data.requests || [])) {
                requestsBySource.discord.set(request.id, request);
            }
            listenerUpdates += 1;
            mergeAndRender();
        } catch (error) {
            console.error("Eroare la încărcarea cererilor:", error);
            listenerErrors = 2;
            container.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "A apărut o eroare la încărcarea cererilor.")}</div>`;
        }
    }

    loadRequests();
    setInterval(loadRequests, 30000);
    window.addEventListener("focus", loadRequests);
'''
    path.write_text(content[:start] + replacement + content[script_end:], encoding="utf-8")


def main():
    (ROOT / "api").mkdir(exist_ok=True)
    (ROOT / "api" / "discord-auth.js").write_text(API_AUTH, encoding="utf-8")
    (ROOT / "api" / "my-requests.js").write_text(API_REQUESTS, encoding="utf-8")
    patch_auth()
    patch_requests_page()
    print("Discord cookie auth migration applied")


if __name__ == "__main__":
    main()
