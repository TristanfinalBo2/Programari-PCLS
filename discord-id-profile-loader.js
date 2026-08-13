import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
