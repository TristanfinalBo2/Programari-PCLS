function boot() {
  if (!window.location.pathname.toLowerCase().endsWith("/admin.html")) return;

  document.addEventListener("click", async event => {
    const button = event.target.closest("#approve-copy-btn");
    if (!button) return;

    const preview = document.getElementById("approval-dispatch-text");
    if (!preview) return;

    // Override the legacy copy handler so the copied text exactly matches
    // the message currently visible in the approval preview.
    event.preventDefault();
    event.stopImmediatePropagation();

    const text = String(preview.value || preview.textContent || "").trim();
    if (!text) {
      window.showToast?.("Nu există date de copiat.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      window.showToast?.("Mesajul din preview a fost copiat.", "success");

      const original = button.innerHTML;
      button.innerHTML = "✓ Copiat!";
      setTimeout(() => { button.innerHTML = original; }, 1800);
    } catch (error) {
      console.error("Approval preview copy:", error);
      window.showToast?.("Nu s-a putut copia mesajul.", "error");
    }
  }, true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
