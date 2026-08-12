const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldPath } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();

const ADMIN_ROLES = new Set(["admin", "superadmin"]);

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

exports.deleteUserAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Trebuie să fii autentificat.");
  }

  const requesterUid = request.auth.uid;
  const targetUid = String(request.data?.uid || "").trim();

  if (!targetUid) {
    throw new HttpsError("invalid-argument", "UID-ul utilizatorului este obligatoriu.");
  }

  if (targetUid === requesterUid) {
    throw new HttpsError("permission-denied", "Nu îți poți șterge propriul cont din panoul de administrare.");
  }

  const requesterSnap = await db.collection("utilizatori").doc(requesterUid).get();
  if (!requesterSnap.exists) {
    throw new HttpsError("permission-denied", "Profilul administratorului nu există.");
  }

  const requesterData = requesterSnap.data() || {};
  const requesterRole = normalizeRole(requesterData.role || requesterData.rol);

  if (!ADMIN_ROLES.has(requesterRole)) {
    throw new HttpsError("permission-denied", "Nu ai permisiunea de a șterge conturi.");
  }

  let targetUser;
  try {
    targetUser = await getAuth().getUser(targetUid);
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      await db.collection("utilizatori").doc(targetUid).delete().catch(() => {});
      return {
        ok: true,
        uid: targetUid,
        message: "Documentul utilizatorului a fost șters; contul Firebase Authentication nu mai exista."
      };
    }

    console.error("getUser failed:", error);
    throw new HttpsError("internal", "Nu am putut identifica utilizatorul.");
  }

  const targetSnap = await db.collection("utilizatori").doc(targetUid).get();
  const targetData = targetSnap.exists ? (targetSnap.data() || {}) : {};
  const targetRole = normalizeRole(targetData.role || targetData.rol);

  if (targetRole === "superadmin" && requesterRole !== "superadmin") {
    throw new HttpsError("permission-denied", "Doar un superadmin poate șterge un superadmin.");
  }

  await getAuth().deleteUser(targetUser.uid);
  await db.collection("utilizatori").doc(targetUser.uid).delete();

  return {
    ok: true,
    uid: targetUser.uid,
    email: targetUser.email || null,
    message: "Contul a fost șters complet."
  };
});
