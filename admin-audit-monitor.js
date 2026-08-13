import { auth, db } from "./firebase-config.js";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const requestBaseline = new Map();
const userBaseline = new Map();
let initializedRequests = false;
let initializedUsers = false;
let running = false;

const norm = value => String(value || "").trim().toLowerCase();
const nameOf = d => String(d?.nume || d?.name || d?.displayName || d?.email || "Sistem").trim();
const roleOf = d => norm(d?.role || d?.rol);
const activeOf = d => d?.activ !== false && d?.active !== false && d?.enabled !== false;

const requestFingerprint = d => JSON.stringify({
  status: norm(d?.status),
  archived: d?.arhivat === true || d?.archived === true,
  deleted: d?.deleted === true,
  processedBy: String(d?.procesat_de || ""),
  processedAt: String(d?.data_procesare || "")
});

const userFingerprint = d => JSON.stringify({
  active: activeOf(d),
  role: roleOf(d),
  name: nameOf(d)
});

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function auditDocId(key) {
  return `evt_${stableHash(key)}_${stableHash(String(key).split(":").slice(0, 3).join(":"))}`;
}

async function currentActor() {
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

function actorFromProcessedBy(value, fallback) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (!match) return fallback;
  return { ...fallback, name: match[1].trim() || fallback.name };
}

function requestName(data) {
  return String(
    data?.nume_proprietar ||
    data?.proprietar ||
    data?.reprezentant ||
    data?.nume ||
    "Cerere"
  ).trim();
}

function departmentName(data) {
  return String(
    data?.departament ||
    data?.departament_medical ||
    data?.department ||
    data?.dept ||
    ""
  ).trim();
}

function actionFromRequestChange(oldData, newData) {
  const oldFp = JSON.parse(requestFingerprint(oldData));
  const newFp = JSON.parse(requestFingerprint(newData));
  const processed = String(newData?.procesat_de || "").toLowerCase();

  if (oldFp.deleted !== newFp.deleted) {
    return newFp.deleted ? "Cerere mutată în Coș" : "Cerere restaurată";
  }

  if (oldFp.archived !== newFp.archived) {
    return newFp.archived ? "Cerere arhivată" : "Cerere dezarhivată";
  }

  if (oldFp.status !== newFp.status) {
    if (processed.includes("aprobat")) return "Cerere aprobată";
    if (processed.includes("respins")) return "Cerere respinsă";
    if (processed.includes("restaurat")) return "Cerere restaurată";
    if (processed.includes("coș") || processed.includes("cos")) return "Cerere mutată în Coș";
    return `Status cerere schimbat: ${newData?.status || "modificat"}`;
  }

  if (oldFp.processedBy !== newFp.processedBy || oldFp.processedAt !== newFp.processedAt) {
    if (processed.includes("aprobat")) return "Cerere aprobată";
    if (processed.includes("respins")) return "Cerere respinsă";
    if (processed.includes("arhivat")) return processed.includes("desarhivat") ? "Cerere dezarhivată" : "Cerere arhivată";
    if (processed.includes("restaurat")) return "Cerere restaurată";
    if (processed.includes("coș") || processed.includes("cos")) return "Cerere mutată în Coș";
    return "Cerere procesată";
  }

  return null;
}

async function writeAudit(data, uniquenessKey) {
  try {
    const auditId = auditDocId(uniquenessKey || `${data.targetType || "event"}:${data.targetId || "unknown"}:${data.action || "action"}`);
    await setDoc(doc(db, "audit_log", auditId), {
      ...data,
      createdAt: serverTimestamp()
    }, { merge: false });
  } catch (error) {
    console.error("AUDIT LOG ERROR:", error);
  }
}

async function writeRequestAudit(targetId, oldData, newData, explicitDeleted = false) {
  const action = explicitDeleted
    ? "Cerere ștearsă definitiv"
    : actionFromRequestChange(oldData, newData);

  if (!action) return;

  let a = await currentActor();
  a = actorFromProcessedBy(newData?.procesat_de, a);

  const oldFingerprint = requestFingerprint(oldData || {});
  const newFingerprint = requestFingerprint(newData || {});
  const uniquenessKey = [
    "cerere",
    targetId,
    action,
    oldFingerprint,
    newFingerprint
  ].join(":");

  await writeAudit({
    actorId: a.uid,
    actorName: a.name,
    actorRole: a.role,
    action,
    targetType: "cerere",
    targetId,
    targetName: requestName(newData || oldData),
    department: departmentName(newData || oldData),
    status: newData?.status || oldData?.status || "",
    source: "firestore_monitor",
    explicitAction: true
  }, uniquenessKey);
}

function startRequests() {
  onSnapshot(
    collection(db, "cereri"),
    async snap => {
      if (!initializedRequests) {
        snap.docs.forEach(d => requestBaseline.set(d.id, d.data() || {}));
        initializedRequests = true;
        return;
      }

      for (const change of snap.docChanges()) {
        if (change.type === "added") {
          requestBaseline.set(change.doc.id, change.doc.data() || {});
          continue;
        }

        if (change.type === "modified") {
          const oldData = requestBaseline.get(change.doc.id) || {};
          const newData = change.doc.data() || {};
          requestBaseline.set(change.doc.id, newData);

          if (requestFingerprint(oldData) !== requestFingerprint(newData)) {
            await writeRequestAudit(change.doc.id, oldData, newData, false);
          }
          continue;
        }

        if (change.type === "removed") {
          const oldData = requestBaseline.get(change.doc.id) || {};
          requestBaseline.delete(change.doc.id);
          await writeRequestAudit(change.doc.id, oldData, oldData, true);
        }
      }
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
        const fp = userFingerprint(data);
        const prev = userBaseline.get(item.id);

        if (initializedUsers && prev && prev !== fp) {
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

          const a = await currentActor();
          const uniquenessKey = [
            "utilizator",
            item.id,
            action,
            prev,
            fp
          ].join(":");

          await writeAudit({
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
            explicitAction: true
          }, uniquenessKey);
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
  startRequests();
  startUsers();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

// Approval Discord dispatch is loaded only on the Admin Panel.
import("./approval-dispatch.js").catch(error => console.error("Approval Discord dispatch:", error));
