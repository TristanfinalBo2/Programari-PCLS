import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Settings can now be opened with the server-side Discord session.
// Install the cookie-profile submit handler immediately, before the legacy Firebase handler.
if (window.location.pathname.toLowerCase().endsWith("/setari.html")) {
  import("./settings-cookie-fix.js?v=20260827-settings-cookie").catch(error => {
    console.error("Discord cookie settings:", error);
  });
}

if (getApps().length) {
  const auth = getAuth(getApp());
  let loaded = false;

  onAuthStateChanged(auth, user => {
    if (!user || loaded) return;
    loaded = true;
    import("./discord-id-profile.js").catch(error => {
      console.error("Discord ID profile module:", error);
    });
  });
}
