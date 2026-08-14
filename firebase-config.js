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

if (window.location.pathname === "/" || window.location.pathname.toLowerCase().endsWith("/index.html")) {
  import("./index-modernizer.js?v=20260814").catch(error => console.error("Index modernizer:", error));
}

document.addEventListener("DOMContentLoaded", () => {
  import("./location-attachment.js?v=20260814-attachment").catch(error => console.error("Location attachment:", error));

  if (window.location.pathname.toLowerCase().endsWith("/admin.html")) {
    import("./admin-location-preview.js?v=20260814-preview").catch(error => console.error("Admin location preview:", error));
    import("./admin-rejection.js?v=20260814-rejection-5").catch(error => console.error("Admin rejection:", error));
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
    const displayName = user.displayName || (emailPart.charAt(0).toUpperCase() + emailPart.slice(1));
    const initial = displayName.charAt(0).toUpperCase();
    let isAdmin = user.email === "tsplayer18@gmail.com";
    if (!isAdmin) {
      try {
        const snap = await getDoc(doc(db, "utilizatori", user.uid));
        if (snap.exists()) {
          const role = String(snap.data()?.role || snap.data()?.rol || "").toLowerCase();
          isAdmin = ["admin", "superadmin", "isuls", "dsls", "mmls", "ssmls"].includes(role);
        }
      } catch (error) { console.error("Eroare verificare rol admin:", error); }
    }
    authContainer.innerHTML = `
      <div class="user-profile-premium">
        <button class="profile-btn-premium" id="profileToggle" type="button"><span>Salut, ${displayName}</span><div class="profile-avatar">${initial}</div><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg></button>
        <div class="profile-dropdown-premium" id="profileDropdown">
          <div class="dropdown-user-info"><span>Conectat cu adresa</span><strong>${user.email ? displayName : "Discord: " + displayName}</strong></div>
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
  import("./rejection-notification-bridge.js?v=20260814-rejection-bridge-1").catch(error => console.error("Rejection notification bridge:", error));
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
    import("./discord-id-profile-loader.js").catch(error => console.error("Discord ID profil:", error));
  }
});

export const FIREBASE_CONFIG_VERSION = "2026-08-14-rejection-v4-location-image-clean";
