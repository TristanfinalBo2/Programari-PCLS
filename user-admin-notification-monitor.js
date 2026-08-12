import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, doc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const baseline = new Map();
let initialized = false;

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function hashId(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function start() {
  if (!document.getElementById("userManagementCard")) return;
  if (!auth.currentUser) return;

  onSnapshot(collection(db, "utilizatori"), async snapshot => {
    const changes = [];

    snapshot.docs.forEach(itemDoc => {
      const data = itemDoc.data() || {};
      const role = normalize(data.role || data.rol);
      const active = data.activ !== false && data.active !== false && data.enabled !== false;
      const fingerprint = `${role}|${active}|${data.nume || data.name || ""}|${data.updatedAt?.seconds || data.updatedAt || ""}`;
      const previous = baseline.get(itemDoc.id);

      if (initialized && previous && previous !== fingerprint && itemDoc.id !== auth.currentUser.uid) {
        const oldParts = previous.split("|");
        const oldRole = oldParts[0];
        const oldActive = oldParts[1] === "true";

        let title = "Cont actualizat";
        let message = "Profilul tău a fost actualizat de un administrator.";
        let type = "info";

        if (role !== oldRole) {
          title = "Rolul contului a fost schimbat";
          message = `Rolul tău a fost schimbat din ${oldRole || "standard"} în ${role || "standard"}.`;
          type = "info";
        } else if (active !== oldActive) {
          title = active ? "Cont activat" : "Cont dezactivat";
          message = active ? "Contul tău a fost activat de un administrator." : "Contul tău a fost dezactivat de un administrator.";
          type = active ? "success" : "warning";
        }

        const notificationId = `account_${hashId(`${itemDoc.id}|${fingerprint}`)}`;
        changes.push({
          id: notificationId,
          recipientId: itemDoc.id,
          title,
          message,
          type,
          read: false,
          createdAt: serverTimestamp()
        });
      }

      baseline.set(itemDoc.id, fingerprint);
    });

    initialized = true;

    for (const notification of changes) {
      try {
        await setDoc(doc(db, "notificari", notification.id), notification, { merge: false });
      } catch (error) {
        console.error("Nu s-a putut crea notificarea contului:", error);
      }
    }
  }, error => console.error("Monitor notificări cont:", error));
}

onAuthStateChanged(auth, user => {
  if (user) start();
});
