import { auth, db } from "./firebase-config.js";
import { collection, onSnapshot, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const requestBaseline = new Map();
const userBaseline = new Map();
let initialized = false;
let initializedUsers = false;
let running = false;

const norm = value => String(value || "").trim().toLowerCase();
const nameOf = d => String(d?.nume || d?.name || d?.displayName || d?.email || "Sistem").trim();
const roleOf = d => norm(d?.role || d?.rol);
const activeOf = d => d?.activ !== false && d?.active !== false && d?.enabled !== false;
const fingerprint = d => JSON.stringify({
  status: norm(d?.status),
  archived: d?.arhivat === true || d?.archived === true,
  deleted: d?.deleted === true,
  processed: d?.procesat_de || "",
  active: activeOf(d),
  role: roleOf(d),
  name: nameOf(d)
});

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
    const snap = await getDoc(doc(db, "utilizatori", u.uid));
    const data = snap.exists() ? snap.data() || {} : {};
    return {
      uid: u.uid,
      name: nameOf({ ...data, email: u.email }),
      role: roleOf(data) || "user"
    };
  } catch {
    return { uid: u.uid, name: u.email || "Utilizator", role: "user" };
  }
}

async function writeAudit(key, data) {
  try {
    await setDoc(
      doc(db, "audit_log", key),
      { ...data, createdAt: serverTimestamp() },
      { merge: false }
    );
    return true;
  } catch (error) {
    console.error("AUDIT LOG ERROR:", error);
    return false;
  }
}

function getRequestTarget(button) {
  return String(
    button?.dataset?.id || button?.getAttribute?.("data-id") || ""
  ).trim();
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

  const values = [...card.querySelectorAll(".card-body p span")]
    .map(el => String(el.textContent || "").trim())
    .filter(Boolean);

  return values[0] || "Cerere";
}

async function auditAdminAction(button) {
  const action = actionForButton(button);
  const targetId = getRequestTarget(button);

  if (!action || !targetId || !auth.currentUser) return;

  const a = await actor();
  const targetName = requestTargetNameFromCard(button);
  const key = `admin_action_${targetId}_${hash(`${action}|${Date.now()}|${a.uid}|${Math.random()}`)}`;

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

    const action = actionForButton(button);
    if (!action) return;

    // Capture phase ensures this runs even if another handler stops bubbling.
    void auditAdminAction(button);
  }, true);
}

function startRequests() {
  onSnapshot(
    collection(db, "cereri"),
    async snap => {
      for (const item of snap.docs) {
        const data = item.data() || {};
        const fp = fingerprint(data);
        const prev = requestBaseline.get(item.id);

        if (initialized && prev && prev !== fp) {
          const old = JSON.parse(prev);
          const current = JSON.parse(fp);
          let action = "Cerere actualizată";

          if (old.status !== current.status) {
            action = `Status cerere: ${current.status || "modificat"}`;
          } else if (old.deleted !== current.deleted) {
            action = current.deleted ? "Cerere mutată în coș" : "Cerere restaurată";
          } else if (old.archived !== current.archived) {
            action = current.archived ? "Cerere arhivată" : "Cerere dezarhivată";
          }

          const a = await actor();
          await writeAudit(`request_change_${item.id}_${hash(fp + String(Date.now()))}`, {
            actorId: a.uid,
            actorName: a.name,
            actorRole: a.role,
            action,
            targetType: "cerere",
            targetId: item.id,
            targetName: data.nume_proprietar || data.proprietar || data.reprezentant || data.nume || "Cerere",
            status: current.status || "",
            department: data.departament || "",
            source: "firestore_monitor",
            explicitAction: false
          });
        }

        requestBaseline.set(item.id, fp);
      }

      initialized = true;
    },
    error => console.error("MONITOR AUDIT CERERI:", error)
  );
}

function startUsers() {
  onSnapshot(
    collection(db, "utilizatori"),
    async snap => {
      for (const item of snap.docs) {
        const data = item.data() || {};
        const fp = fingerprint(data);
        const prev = userBaseline.get(item.id);
        const currentUid = auth.currentUser?.uid;

        if (initializedUsers && prev && prev !== fp && item.id !== currentUid) {
          const old = JSON.parse(prev);
          const current = JSON.parse(fp);
          let action = "Cont utilizator actualizat";

          if (old.role !== current.role) {
            action = `Role schimbat: ${old.role || "—"} → ${current.role || "—"}`;
          } else if (old.active !== current.active) {
            action = current.active ? "Cont reactivat" : "Cont dezactivat";
          } else if (old.name !== current.name) {
            action = "Nume utilizator modificat";
          }

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
    },
    error => console.error("MONITOR AUDIT UTILIZATORI:", error)
  );
}

function init() {
  if (running) return;
  running = true;
  bindAdminActionAudit();
  startRequests();
  startUsers();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (
      document.getElementById("cereri-container") ||
      location.pathname.toLowerCase().endsWith("admin.html")
    ) {
      init();
    }
  }, { once: true });
} else if (
  document.getElementById("cereri-container") ||
  location.pathname.toLowerCase().endsWith("admin.html")
) {
  init();
}
