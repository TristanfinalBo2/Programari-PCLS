const fs = require("fs");
const path = require("path");

let cachedHtml = null;

const notificationPatch = `
<script id="pcls-notification-persistence-fix">
(function () {
    async function loadPersistentNotificationCenter() {
        try {
            const response = await fetch('/api/me', {
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.ok || !data.user?.discordId) return;

            const user = {
                uid: String(data.user.discordId),
                discordId: String(data.user.discordId),
                providerData: [{ uid: String(data.user.discordId) }]
            };

            window.notificationUserKey = user.discordId;

            window.startNotificationListeners = async function (notificationUser) {
                window.notificationUserKey = String(
                    notificationUser?.discordId ||
                    notificationUser?.uid ||
                    notificationUser?.providerData?.[0]?.uid ||
                    user.discordId
                );
                try {
                    const r = await fetch('/api/notifications', {
                        credentials: 'same-origin',
                        cache: 'no-store',
                        headers: { 'Accept': 'application/json' }
                    });
                    const payload = await r.json().catch(() => ({}));
                    if (!r.ok || !payload.ok) return;
                    window.notificationItems = Array.isArray(payload.notifications)
                        ? payload.notifications
                        : [];
                    if (typeof window.renderNotificationCenter === 'function') {
                        window.renderNotificationCenter();
                    }
                } catch (error) {
                    console.error('Eroare notificări server:', error);
                }
            };

            const existing = document.getElementById('notificationToggle');
            if (typeof window.mountDiscordNotificationCenter === 'function') {
                if (!existing) {
                    window.mountDiscordNotificationCenter(user);
                } else if (typeof window.startNotificationListeners === 'function') {
                    await window.startNotificationListeners(user);
                }
            }
        } catch (error) {
            console.error('Eroare centru notificări:', error);
        }
    }

    function boot() {
        // Lasă handler-ele Firebase existente să ruleze primul, apoi refacem
        // centrul pe baza sesiunii Discord din cookie.
        setTimeout(loadPersistentNotificationCenter, 250);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

    window.addEventListener('pageshow', function () {
        setTimeout(loadPersistentNotificationCenter, 50);
    });
})();
</script>`;

module.exports = function handler(req, res) {
    try {
        if (!cachedHtml) {
            const filePath = path.join(process.cwd(), "index.html");
            cachedHtml = fs.readFileSync(filePath, "utf8");
        }

        const html = cachedHtml.includes('id="pcls-notification-persistence-fix"')
            ? cachedHtml
            : cachedHtml.replace("</body>", notificationPatch + "</body>");

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
        return res.status(200).send(html);
    } catch (error) {
        console.error("index-content error:", error);
        return res.status(500).send("Eroare la încărcarea portalului.");
    }
};
