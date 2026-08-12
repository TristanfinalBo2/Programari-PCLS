import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const HEARTBEAT_MS = 30000;
const ACTIVE_WINDOW_MS = 90000;
let heartbeatTimer = null;
let currentUid = null;
let writing = false;

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  currentUid = null;
}

async function writePresence(uid, online) {
  if (!uid || writing) return;
  writing = true;
  try {
    const db = getFirestore(getApp());
    await updateDoc(doc(db, "utilizatori", uid), {
      online: Boolean(online),
      lastSeen: serverTimestamp()
    });
  } catch (error) {
    // Prezența nu trebuie să poată bloca site-ul.
    console.debug("Prezență indisponibilă:", error?.message || error);
  } finally {
    writing = false;
  }
}

async function startPresence(user) {
  stopHeartbeat();
  if (!user || user.isAnonymous) return;

  const db = getFirestore(getApp());
  const uid = user.uid;
  currentUid = uid;

  try {
    const snap = await getDoc(doc(db, "utilizatori", uid));
    const data = snap.exists() ? snap.data() || {} : {};
    const active = data.activ !== false && data.active !== false && data.enabled !== false;
    if (!active) return;
  } catch (error) {
    console.debug("Nu am putut verifica starea contului pentru prezență:", error?.message || error);
    return;
  }

  await writePresence(uid, true);
  heartbeatTimer = setInterval(() => {
    if (document.visibilityState === "visible") writePresence(uid, true);
  }, HEARTBEAT_MS);

  const touch = () => {
    if (document.visibilityState === "visible" && currentUid === uid) writePresence(uid, true);
  };
  document.addEventListener("visibilitychange", touch, { passive: true });

  window.addEventListener("pagehide", () => {
    // Best effort; în caz de închidere brutală, UI-ul consideră userul offline după ACTIVE_WINDOW_MS.
    writePresence(uid, false);
  }, { once: true });
}

function boot() {
  if (!getApps().length) return;
  const auth = getAuth(getApp());
  onAuthStateChanged(auth, user => {
    if (!user) {
      stopHeartbeat();
      return;
    }
    startPresence(user);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

export const PRESENCE_ACTIVE_WINDOW_MS = ACTIVE_WINDOW_MS;
