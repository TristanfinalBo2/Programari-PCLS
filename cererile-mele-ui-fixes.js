(() => {
  const STYLE_ID = 'cererile-mele-ui-fixes';

  function applyDiscordFullWidth() {
    const detailItems = document.querySelectorAll('#modal-details .detail-item');
    detailItems.forEach(item => {
      const label = item.querySelector('.detail-label');
      if (!label) return;
      const text = label.textContent.trim().toLowerCase();
      const isDiscord = text === 'discord id' || text.includes('discord id');
      item.classList.toggle('discord-id-full', isDiscord);
    });
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #modal-details .detail-item.discord-id-full {
        grid-column: 1 / -1 !important;
        width: 100%;
      }
      #modal-details .detail-item.discord-id-full .detail-value {
        width: 100%;
        overflow-wrap: anywhere;
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    installStyle();
    applyDiscordFullWidth();

    const details = document.getElementById('modal-details');
    if (details) {
      const observer = new MutationObserver(applyDiscordFullWidth);
      observer.observe(details, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
