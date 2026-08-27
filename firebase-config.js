import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBst9kibZtc9Cx-KgJ21XcZUkouRtDI1Sc",
  authDomain: "pcls-portal.firebaseapp.com",
  projectId: "pcls-portal",
  storageBucket: "pcls-portal.firebasestorage.app",
  messagingSenderId: "914128618803",
  appId: "1:914128618803:web:09f5321ff58e246c056a46",
  measurementId: "G-TLLV67QCWR"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.va = window.va || function (...args) {
    (window.vaq = window.vaq || []).push(args);
  };

  if (!document.querySelector('script[data-pcls-vercel-analytics="true"]')) {
    const analyticsScript = document.createElement("script");
    analyticsScript.defer = true;
    analyticsScript.src = "/_vercel/insights/script.js";
    analyticsScript.dataset.pclsVercelAnalytics = "true";
    document.head.appendChild(analyticsScript);
  }

  // All Discord login/connect buttons use the server-side Discord OAuth cookie flow.
  // Capture phase runs before legacy Firebase popup listeners on the forms.
  document.addEventListener("click", event => {
    const button = event.target?.closest?.(
      "#btnDiscordLogin, #discord-modal-connect, #discord-trigger, #discordModalConnect, #discordIdConnect, #discordIdVerify, [data-discord-connect]"
    );
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const returnTo = window.location.pathname + window.location.search + window.location.hash;
    window.location.assign(`/api/discord-auth?return_to=${encodeURIComponent(returnTo)}`);
  }, true);

  // Keep Discord identity available to every page/form without using Firebase OIDC.
  window.PCLSDiscordSessionPromise = fetch("/api/me", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" }
  })
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      const user = data?.ok ? data.user : null;
      const discordId = String(user?.discordId || "").trim();
      if (!/^\d{17,20}$/.test(discordId)) return null;

      const username = String(user?.username || user?.name || "").trim();
      window.PCLSDiscordSession = { discordId, username, name: username, email: String(user?.email || "") };

      document.querySelectorAll('input[name="discord"], input[name="discord_id"], input[name="discordId"], #discordIdInput, #discord-input').forEach(input => {
        input.value = discordId;
        input.setAttribute("value", discordId);
        input.readOnly = true;
        input.dataset.pclsDiscordAuto = "true";
      });

      const connectedBox = document.getElementById("discord-connected-box") || document.getElementById("discordConnectedBox");
      const loginBox = document.getElementById("discord-login-box") || document.getElementById("discordLoginBox");
      const submit = document.getElementById("submit");
      if (connectedBox) connectedBox.style.display = "flex";
      if (loginBox) loginBox.style.display = "none";
      if (submit) submit.disabled = false;

      document.dispatchEvent(new CustomEvent("pcls:discord-session-ready", { detail: window.PCLSDiscordSession }));
      return window.PCLSDiscordSession;
    })
    .catch(error => {
      console.warn("Discord cookie session unavailable:", error);
      return null;
    });
}

if (window.location.pathname === "/" || window.location.pathname.toLowerCase().endsWith("/index.html")) {
  import("./index-modernizer.js?v=20260814").catch(error => console.error("Index modernizer:", error));
}

if (window.location.pathname.toLowerCase().endsWith("/auth.html")) {
  import("./discord-custom-auth.js?v=20260827-cookie-redirect").catch(error => console.error("Custom Discord auth:", error));
}

document.addEventListener("DOMContentLoaded", () => {
  import("./location-attachment.js?v=20260814-attachment").catch(error => console.error("Location attachment:", error));
  import("./noroc-discord-photo.js?v=20260824-noroc-photo").catch(error => console.error("Noroc Discord photo:", error));

  if (window.location.pathname.toLowerCase().endsWith("/auth.html")) {
    import("./auth-password-reset.js?v=20260816-password-reset-1").catch(error => console.error("Password reset:", error));
  }

  if (window.location.pathname.toLowerCase().endsWith("/admin.html")) {
    import("./admin-location-preview.js?v=20260814-preview").catch(error => console.error("Admin location preview:", error));
    import("./admin-rejection-v2.js?v=20260814-rejection-v2-1").catch(error => console.error("Admin rejection:", error));
    import("./admin-age-priority.js?v=20260817-live-age-2").catch(error => console.error("Admin age priority:", error));
    import("./admin-discord-dm.js?v=20260817-vercel-dm-1").catch(error => console.error("Admin Discord DM:", error));
  }

  if (window.location.pathname.toLowerCase().endsWith("/cererile_mele.html")) {
    import("./cererile-mele-location-preview.js?v=20260814-my-preview-5").catch(error => console.error("Cererile Mele location/rejection preview:", error));
    import("./cererile-mele-ui-fixes.js?v=20260814-discord-fullwidth-1").catch(error => console.error("Cererile Mele UI fixes:", error));
  }

  const authContainer = document.getElementById("auth-section-premium") || document.getElementById("auth-links");
  if (!authContainer) return;
  onAuthStateChanged(auth, async user => {
    if (!user) {
      authContainer.innerHTML = `<a href="auth.html" style="color:#35f2ad;text-decoration:none;font-weight:bold;border:1px solid rgba(53,242,173,.3);padding:8px 16px;border-radius:99px;background:rgba(53,242,173,.05);font-size:.9rem;">Autentificare</a>`;
      return;
    }
    const emailPart = user.email ? user.email.split("@")[0] : "User";
    let displayName = user.displayName || (emailPart.charAt(0).toUpperCase() + emailPart.slice(1));
    const initial = displayName.charAt(0).toUpperCase();
    let isAdmin = user.email === "tsplayer18@gmail.com";
    try {
      const snap = await getDoc(doc(db, "utilizatori", user.uid));
      if (snap.exists()) {
        const profile = snap.data() || {};
        displayName = profile.nume || profile.name || displayName;
        const role = String(profile.role || profile.rol || "").toLowerCase();
        isAdmin = isAdmin || ["admin", "superadmin", "isuls", "dsls", "mmls", "ssmls"].includes(role);
      }
    } catch (error) { console.error("Eroare verificare profil/rol:", error); }
    authContainer.innerHTML = `
      <div class="user-profile-premium">
        <button class="profile-btn-premium" id="profileToggle" type="button"><span>Salut, ${displayName}</span><div class="profile-avatar">${initial}</div><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg></button>
        <div class="profile-dropdown-premium" id="profileDropdown">
          <div class="dropdown-user-info"><span>Conectat</span><strong>${displayName}</strong></div>
          <div class="dropdown-divider"></div>
          ${isAdmin ? `<a href="admin.html" class="dropdown-item-premium">Admin Panel</a>` : ""}
          <a href="setari.html" class="dropdown-item-premium">Setări cont</a>
          <div class="dropdown-divider"></div>
          <button id="btnLogout" class="dropdown-item-premium" style="color:#ff6b6b;background:none;border:none;width:100%;text-align:left;cursor:pointer;">Deconectare</button>
        </div>
      </div>`;
    const profileToggle = document.getElementById("profileToggle");
    const profileDropdown = document.getElementById("profileDropdown");
    if (profileToggle && profileDropdown) {
      profileToggle.onclick = event => { event.stopPropagation(); profileDropdown.classList.toggle("show"); };
      if (!window.__pclsProfileClickBound) {
        window.__pclsProfileClickBound = true;
        document.addEventListener("click", event => {
          const t = document.getElementById("profileToggle");
          const d = document.getElementById("profileDropdown");
          if (t && d && !t.contains(event.target) && !d.contains(event.target)) d.classList.remove("show");
        });
      }
    }
    document.getElementById("btnLogout")?.addEventListener("click", async () => { try { await signOut(auth); window.location.reload(); } catch (error) { console.error("Eroare logout:", error); } });
  });
});

window.addEventListener("DOMContentLoaded", () => {
  import("./discord-id-guard.js").catch(error => console.error("Discord ID guard:", error));
  import("./notification-center.js?v=20260814").catch(error => console.error("Centrul de notificări:", error));
  import("./rejection-popup-fix.js?v=20260814-rejection-popup-2").catch(error => console.error("Rejection popup fix:", error));
  import("./approval-copy-fix.js?v=20260816-approval-copy-1").catch(error => console.error("Approval copy fix:", error));
  if (window.location.pathname.toLowerCase().endsWith("/audit.html")) {
    import("./audit-cleaner.js").catch(error => console.error("Audit cleaner:", error));
  }
  if (document.getElementById("cereri-container")) {
    import("./admin-dashboard.js").catch(error => console.error("Dashboard admin:", error));
    import("./admin-dashboard-skeleton.js").catch(error => console.error("Skeleton dashboard:", error));
    import("./admin-requests-skeleton.js").catch(error => console.error("Skeleton cereri:", error));
    import("./admin-departments-v2.js").catch(error => console.error("Department dashboard V2:", error));
    import("./admin-dashboard-layout-guard.js").catch(error => console.error("Dashboard layout guard:", error));
    import("./admin-audit-monitor.js").catch(error => console.error("Audit monitor:", error));
    import("./admin-notification-monitor.js?v=20260814-rejection-reason-3").catch(error => console.error("Monitor notificări admin:", error));
  }
  if (window.location.pathname.toLowerCase().endsWith("/setari.html")) {
    import("./gestionare-utilizatori-v2.js").catch(error => console.error("Gestionare utilizatori:", error));
    import("./gestionare-utilizatori-role-null.js?v=20260826-role-null-1").catch(error => console.error("Gestionare utilizatori role null:", error));
    import("./discord-id-profile-loader.js").catch(error => console.error("Discord ID profil:", error));
  }
});

export const FIREBASE_CONFIG_VERSION = "2026-08-27-cookie-discord-fullpage";
