function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function stabilizeLayout() {
  const main = document.querySelector("#pcls-admin-dashboard .pcls-dash-main");
  const panels = main?.querySelectorAll(":scope > .pcls-dash-panel");
  if (!main || !panels || panels.length < 2) return;

  main.style.alignItems = "stretch";
  main.style.gridAutoRows = "1fr";

  panels.forEach(panel => {
    panel.style.alignSelf = "stretch";
    panel.style.height = "100%";
    panel.style.minHeight = "320px";
    panel.style.maxHeight = "320px";
    panel.style.boxSizing = "border-box";
    panel.style.overflow = "hidden";
  });

  const departments = document.getElementById("dash-departments")?.closest?.(".pcls-dash-panel");
  const activity = document.getElementById("dash-audit-mini")?.closest?.(".pcls-dash-panel");

  [departments, activity].forEach(panel => {
    if (!panel) return;
    panel.style.height = "320px";
    panel.style.minHeight = "320px";
    panel.style.maxHeight = "320px";
  });
}

function dedupeActivity() {
  const host = document.getElementById("dash-audit-mini");
  if (!host) return;
  const rows = [...host.querySelectorAll(".pcls-audit-item")];
  if (rows.length < 2) return;

  const seen = new Set();
  rows.forEach(row => {
    const actor = normalizeText(row.querySelector(".pcls-audit-actor")?.textContent);
    const action = normalizeText(row.querySelector(".pcls-audit-action")?.textContent);
    const target = normalizeText(row.querySelector(".pcls-audit-target")?.textContent);
    const key = `${actor}|${action}|${target}`;
    if (seen.has(key)) {
      row.remove();
      return;
    }
    seen.add(key);
  });
}

function start() {
  stabilizeLayout();
  dedupeActivity();

  const dashboard = document.getElementById("pcls-admin-dashboard");
  if (!dashboard || dashboard.dataset.layoutGuard === "true") return;
  dashboard.dataset.layoutGuard = "true";

  const observer = new MutationObserver(() => {
    stabilizeLayout();
    dedupeActivity();
  });
  observer.observe(dashboard, { childList: true, subtree: true });

  window.addEventListener("resize", stabilizeLayout);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}

window.addEventListener("pageshow", start);
