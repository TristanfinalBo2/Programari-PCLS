import { auth, db } from "./firebase-config.js";
import { collection, onSnapshot, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const userBaseline = new Map();
let initializedUsers = false;
let running = false;

const norm = value => String(value || "").trim().toLowerCase();
const nameOf = d => String(d?.nume || d?.name || d?.displayName || d?.email || "Sistem").trim();
const roleOf = d => norm(d?.role || d?.rol);
const activeOf = d => d?.activ !== false && d?.active !== false && d?.enabled !== false;
const fingerprint = d => JSON.stringify({ active: activeOf(d), role: roleOf(d), name: nameOf(d) });

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

async function actor() {
  const u = auth.currentUser;
  if (!u) return { uid: "system", name: "Sistem", role: "system" };
  try {
    const s = await getDoc(doc(db, "utilizatori", u.uid));
    const d = s.exists() ? s.data() || {} : {};
    return { uid: u.uid, name: nameOf({ ...d, email: u.email }), role: roleOf(d) || "user" };
  } catch {
    return { uid: u.uid, name: u.email || "Utilizator", role: "user" };
  }
}

async function writeAudit(key, data) {
  try {
    await setDoc(doc(db, "audit_log", key), { ...data, createdAt: serverTimestamp() }, { merge: false });
  } catch (error) {
    console.error("AUDIT LOG ERROR:", error);
  }
}

function getRequestTarget(button) {
  return String(button?.dataset?.id || button?.getAttribute?.("data-id") || "").trim();
}

function actionForButton(button) {
  const classes = button?.classList;
  if (!classes) return null;
  if (classes.contains("btn-approve")) return "Cerere aprobată";
  if (classes.contains("btn-reject")) return "Cerere respinsă";
  if (classes.contains("btn-archive")) return "Cerere arhivată";
  if (classes.contains("btn-unarchive")) return "Cerere dezarhivată";
  if (classes.contains("btn-restore")) return "Cerere restaurată";
  if (classes.contains("btn-trash")) return "Acțiune coș/ștergere cerere";
  return null;
}

function requestTargetNameFromCard(button) {
  const card = button?.closest?.(".card");
  if (!card) return "Cerere";
  return [...card.querySelectorAll(".card-body p span")]
    .map(el => String(el.textContent || "").trim())
    .filter(Boolean)[0] || "Cerere";
}

async function auditAdminAction(button) {
  const action = actionForButton(button);
  const targetId = getRequestTarget(button);
  if (!action || !targetId || !auth.currentUser) return;

  const a = await actor();
  const targetName = requestTargetNameFromCard(button);
  const key = `admin_action_${targetId}_${hash(`${action}|${a.uid}`)}`;

  await writeAudit(key, {
    actorId: a.uid,
    actorName: a.name,
    actorRole: a.role,
    action,
    targetType: "cerere",
    targetId,
    targetName,
    department: "",
    status: "",
    source: "admin.html",
    explicitAction: true
  });
}

function bindAdminActionAudit() {
  if (window.__pclsAdminAuditActionsBound) return;
  window.__pclsAdminAuditActionsBound = true;
  document.addEventListener("click", event => {
    const button = event.target?.closest?.("button[data-id]");
    if (!button || !button.closest("#cereri-container")) return;
    if (!actionForButton(button)) return;
    void auditAdminAction(button);
  }, true);
}

function startUsers() {
  onSnapshot(collection(db, "utilizatori"), async snap => {
    for (const item of snap.docs) {
      const data = item.data() || {};
      const fp = fingerprint(data);
      const prev = userBaseline.get(item.id);
      const currentUid = auth.currentUser?.uid;

      if (initializedUsers && prev && prev !== fp && item.id !== currentUid) {
        const old = JSON.parse(prev);
        const current = JSON.parse(fp);
        let action = "Cont utilizator actualizat";
        if (old.role !== current.role) action = `Role schimbat: ${old.role || "—"} → ${current.role || "—"}`;
        else if (old.active !== current.active) action = current.active ? "Cont reactivat" : "Cont dezactivat";
        else if (old.name !== current.name) action = "Nume utilizator modificat";

        const a = await actor();
        await writeAudit(`user_change_${item.id}_${hash(fp + String(Date.now()))}`, {
          actorId: a.uid,
          actorName: a.name,
          actorRole: a.role,
          action,
          targetType: "utilizator",
          targetId: item.id,
          targetName: nameOf(data),
          targetRole: roleOf(data),
          active: activeOf(data),
          source: "firestore_monitor",
          explicitAction: false
        });
      }
      userBaseline.set(item.id, fp);
    }
    initializedUsers = true;
  }, error => console.error("MONITOR AUDIT UTILIZATORI:", error));
}

function init() {
  if (running) return;
  running = true;
  bindAdminActionAudit();
  startUsers();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
