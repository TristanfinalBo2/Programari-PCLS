import { auth, db } from "./firebase-config.js";
import { collection, doc, getDoc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function normalize(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function requestIdFromItem(item) {
  const link = item?.querySelector?.(".notification-open");
  const href = link?.getAttribute("href") || "";
  try {
    const url = new URL(href, window.location.href);
    return url.searchParams.get("cerere");
  } catch (_) {
    const match = href.match(/[?&]cerere=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

async function refreshRejectedItem(item) {
  if (!item) return;
  const requestId = requestIdFromItem(item);
  if (!requestId) return;

  try {
    const snap = await getDoc(doc(db, "cereri", requestId));
    if (!snap.exists()) return;
    const request = snap.data() || {};
    const status = normalize(request.status);
    if (!status.includes("respins") && !status.includes("reject")) return;

    item.classList.remove("approved");
    item.classList.add("rejected");

    const title = item.querySelector(".notification-copy strong");
    const message = item.querySelector(".notification-copy p");
    const reason = String(request.rejectionReason || request.motivRespingere || request.motiv_respingere || "").trim();

    if (title) title.textContent = "Cererea a fost respinsă";
    if (message) message.textContent = reason
      ? `Cererea ta a fost respinsă cu motiv: ${reason}`
      : "Cererea ta a fost respinsă. Verifică detaliile cererii.";
  } catch (error) {
    console.warn("Rejection popup fix:", error?.message || error);
  }
}

function refreshVisibleItems() {
  document.querySelectorAll("#notificationList .notification-item").forEach(refreshRejectedItem);
}

function start() {
  if (!(window.location.pathname === "/" || window.location.pathname.toLowerCase().endsWith("/index.html"))) return;

  const observer = new MutationObserver(() => refreshVisibleItems());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  onSnapshot(query(collection(db, "cereri")), snapshot => {
    const rejectedIds = new Set();
    snapshot.forEach(d => {
      const data = d.data() || {};
      const status = normalize(data.status);
      if (status.includes("respins") || status.includes("reject")) rejectedIds.add(d.id);
    });
    if (!rejectedIds.size) return;
    refreshVisibleItems();
  }, error => console.warn("Rejection popup status listener:", error?.message || error));

  refreshVisibleItems();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
