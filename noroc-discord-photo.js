const PATCH_FLAG = "__pclsNorocDiscordPhotoPatch";

function isNorocEventPayload(payload) {
  const title = String(payload?.embeds?.[0]?.title || "").toLowerCase();
  return title.includes("o nouă cerere a fost trimisă") && Array.isArray(payload.embeds);
}

function getWebhookUrl(input) {
  return typeof input === "string" ? input : String(input?.url || "");
}

function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const base64 = match[2];
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (_) {
    return null;
  }
}

function makeNormalMessage(payload) {
  const embed = payload?.embeds?.[0] || {};
  const lines = [];
  const mention = String(payload?.content || "").trim();
  if (mention) lines.push(mention);
  if (embed.title) lines.push(embed.title);

  for (const field of Array.isArray(embed.fields) ? embed.fields : []) {
    const name = String(field?.name || "").trim();
    const value = String(field?.value || "").trim();
    if (!name) continue;
    if (name.toLowerCase() === "locație") {
      lines.push(`📍 **Locație:** Fotografia locației este atașată mai jos.`);
    } else {
      lines.push(`**${name}:** ${value || "N/A"}`);
    }
  }

  return lines.join("\n\n");
}

function install() {
  if (window[PATCH_FLAG]) return;
  window[PATCH_FLAG] = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    try {
      const url = getWebhookUrl(input);
      if (!/discord\.com\/api\/webhooks\//i.test(url)) {
        return originalFetch(input, init);
      }

      let payload = null;
      if (typeof init?.body === "string") {
        try { payload = JSON.parse(init.body); } catch (_) {}
      }

      if (!payload || !isNorocEventPayload(payload)) {
        return originalFetch(input, init);
      }

      const attachment = document.querySelector(".pcls-location-input");
      const file = attachment?.files?.[0] || null;
      if (!file) return originalFetch(input, init);

      const normalContent = makeNormalMessage(payload);
      const multipart = new FormData();
      multipart.append("payload_json", JSON.stringify({
        username: payload.username || "PCLS Bot",
        avatar_url: payload.avatar_url,
        content: normalContent,
        allowed_mentions: payload.allowed_mentions
      }));

      const safeName = String(file.name || "locatie.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
      multipart.append("files[0]", file, safeName);

      return originalFetch(input, {
        ...init,
        method: "POST",
        headers: undefined,
        body: multipart
      });
    } catch (error) {
      console.error("PCLS Noroc Discord photo:", error);
      return originalFetch(input, init);
    }
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", install, { once: true });
} else {
  install();
}
