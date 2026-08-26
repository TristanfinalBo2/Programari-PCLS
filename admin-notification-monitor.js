import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

if (window.location.pathname.toLowerCase().endsWith("/admin.html")) {
  import("./approval-dispatch.js").catch(error => console.error("Approval dispatch:", error));
}

const initialized = new Map();
let firstSnapshot = true;
let currentAdminName = "Administrator";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function ownerUid(item = {}) {
  const candidates = [
    item.ownerUid, item.ownerUID, item.firebaseUid, item.firebaseUID,
    item.userUid, item.userUID, item.uid, item.userId, item.user_id,
    item.utilizatorId, item.createdByUid, item.created_by_uid,
    item.submittedByUid, item.requesterUid, item.requesterId
  ];
  return candidates.find(value => {
    const text = String(value || "").trim();
    return text.length >= 20 && text !== "undefined" && text !== "null";
  }) || null;
}

function hashId(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function buildNotification(item, status) {
  const normalized = normalize(status);

  // Respingerea este notificată direct de fluxul de respingere,
  // cu destinatarul rezolvat sigur după UID/Discord.
  if (["respins", "respinsa", "rejected"].includes(normalized)) return null;

  // Arhivarea este o acțiune administrativă internă și NU trebuie
  // să genereze o notificare de status către proprietarul cererii.
  if (["arhivat", "archived"].includes(normalized)) return null;

  const recipientId = ownerUid(item);
  if (!recipientId) return null;

  let type = "info";
  let title = "Actualizare cerere";
  let message = `Cererea ${item.id || "ta"} a fost actualizată.`;

  if (["aprobat", "acceptat", "approved"].includes(normalized)) {
    type = "success";
    title = "Cerere aprobată";
    message = "Cererea ta a fost aprobată. Poți deschide cererea pentru detalii.";
  } else if (["in_cos", "cos"].includes(normalized)) {
    type = "warning";
    title = "Cererea a fost mutată în Coș";
    message = "Cererea ta a fost mutată în Coș de către un administrator.";
  } else {
    return null;
  }

  const fingerprint = [item.id, normalized, item.data_procesare || item.updatedAt || ""].join("|");
  const notificationId = `request_${hashId(fingerprint)}`;

  return {
    id: notificationId,
    data: {
      recipientId,
      title,
      message,
      type,
      requestId: item.id || null,
      requestUrl: item.id ? `cererile_mele.html?cerere=${encodeURIComponent(item.id)}` : "cererile_mele.html",
      status: normalized,
      actorName: currentAdminName,
      read: false,
      createdAt: serverTimestamp()
    }
  };
}

function start() {
  if (!document.getElementById("cereri-container")) return;
  if (!auth.currentUser) return;

  onSnapshot(collection(db, "cereri"), async snapshot => {
    const changes = [];

    snapshot.docs.forEach(itemDoc => {
      const item = { id: itemDoc.id, ...(itemDoc.data() || {}) };
      const status = normalize(item.status || "in_asteptare");
      const fingerprint = `${status}|${item.data_procesare || item.updatedAt || ""}`;

      if (!firstSnapshot) {
        const previous = initialized.get(item.id);
        if (previous && previous !== fingerprint) {
          const notification = buildNotification(item, status);
          if (notification) changes.push(notification);
        }
      }

      initialized.set(item.id, fingerprint);
    });

    firstSnapshot = false;

    for (const notification of changes) {
      try {
        await setDoc(doc(db, "notificari", notification.id), notification.data, { merge: false });
      } catch (error) {
        console.error("Nu s-a putut crea notificarea pentru cerere:", error);
      }
    }
  }, error => console.error("Monitor notificări cereri:", error));
}

onAuthStateChanged(auth, user => {
  if (!user) return;
  currentAdminName = user.displayName || (user.email ? user.email.split("@")[0] : "Administrator");
  start();
});
