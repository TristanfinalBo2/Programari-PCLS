import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DISCORD_ID_RE = /^\d{17,20}$/;

function injectStyles() {
  if (document.getElementById("discord-id-profile-style")) return;
  const style = document.createElement("style");
  style.id = "discord-id-profile-style";
  style.textContent = `.discord-id-required{margin-top:16px;padding:18px;border-radius:20px;border:1px solid rgba(255,214,10,.18);background:linear-gradient(145deg,rgba(255,214,10,.045),rgba(255,255,255,.018))}.discord-id-required.ok{border-color:rgba(104,242,192,.15);background:rgba(104,242,192,.035)}.discord-id-required-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.discord-id-required-title{font-size:.86rem;font-weight:800;color:var(--text)}.discord-id-required-copy{margin-top:4px;color:var(--text-3);font-size:.69rem;line-height:1.5;max-width:690px}.discord-id-required-badge{display:inline-flex;align-items:center;gap:6px;min-height:24px;padding:0 9px;border-radius:999px;font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}.discord-id-required-badge::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}.discord-id-required-badge.pending{color:#ffe39a;background:rgba(255,214,10,.07);border:1px solid rgba(255,214,10,.12)}.discord-id-required-badge.ok{color:#caffec;background:rgba(104,242,192,.07);border:1px solid rgba(104,242,192,.12)}.discord-id-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end;margin-top:14px}.discord-id-row .input-shell{min-width:0}.discord-id-hint{margin-top:7px;color:var(--text-3);font-size:.62rem}.discord-id-error{display:none;margin-top:7px;color:#ffd5dc;font-size:.65rem;line-height:1.4}.discord-id-error.show{display:block}.discord-id-save{min-height:50px;padding:0 18px;border:1px solid rgba(124,231,255,.18);border-radius:16px;color:#fff;background:linear-gradient(110deg,rgba(76,141,255,.82),rgba(145,117,238,.76));font:inherit;font-size:.76rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;cursor:pointer}.discord-id-save:disabled{opacity:.55;cursor:not-allowed}@media(max-width:700px){.discord-id-required-head{flex-direction:column}.discord-id-row{grid-template-columns:1fr}.discord-id-save{width:100%}}`;
  document.head.appendChild(style);
}

function createCard(existingId = "", autoDetected = false) {
  const card = document.createElement("section");
  card.className = "discord-id-required";
  card.innerHTML = `<div class="discord-id-required-head"><div><div class="discord-id-required-title">Identificare Discord</div><div class="discord-id-required-copy">Discord ID-ul este folosit pentru identificarea membrului în Gestionare utilizatori și în operațiunile administrative. ${autoDetected ? "ID-ul a fost detectat automat din autentificarea Discord." : "Dacă nu ai autentificare Discord, introdu ID-ul numeric al contului tău Discord."}</div></div><span id="discord-id-badge" class="discord-id-required-badge pending">Obligatoriu</span></div><div class="discord-id-row"><div><div class="input-shell"><input id="discordIdInput" class="form-control" inputmode="numeric" autocomplete="off" maxlength="20" placeholder="Ex.: 123456789012345678" value=""></div><div class="discord-id-hint">ID Discord = 17–20 cifre. Nu introduce @username.</div><div id="discordIdError" class="discord-id-error"></div></div><button id="discordIdSave" class="discord-id-save" type="button">Salvează Discord ID</button></div>`;
  const profileCard = document.querySelector("#profileForm")?.closest(".settings-card");
  if (profileCard?.parentElement) profileCard.insertAdjacentElement("afterend", card);
  else document.querySelector(".content")?.prepend(card);
  card.querySelector("#discordIdInput").value = existingId;
  return card;
}

async function init() {
  if (!getApps().length) return;
  injectStyles();
  const user = getAuth(getApp()).currentUser;
  if (!user) return;

  const db = getFirestore(getApp());
  const ref = doc(db, "utilizatori", user.uid);
  let existingId = "";
  try {
    const snap = await getDoc(ref);
    existingId = String(snap.data()?.discordId || snap.data()?.discord_id || "").trim();
  } catch (error) {
    console.error("Discord ID profil:", error);
  }

  const providerDiscord = user.providerData.find(p => p.providerId === "oidc.discord" || String(p.providerId || "").includes("discord"));
  const providerId = String(providerDiscord?.uid || "").trim();
  const discordLogin = Boolean(providerDiscord);

  if (!existingId && DISCORD_ID_RE.test(providerId)) {
    existingId = providerId;
    try {
      await updateDoc(ref, { discordId: existingId, updatedAt: serverTimestamp() });
    } catch (error) {
      console.warn("Nu am putut sincroniza automat Discord ID:", error?.message || error);
    }
  }

  const card = createCard(existingId, discordLogin);
  const input = card.querySelector("#discordIdInput");
  const button = card.querySelector("#discordIdSave");
  const errorBox = card.querySelector("#discordIdError");
  const badge = card.querySelector("#discord-id-badge");
  if (!input || !button || !errorBox || !badge) return;

  const paint = value => {
    const valid = DISCORD_ID_RE.test(String(value || "").trim());
    card.classList.toggle("ok", valid);
    badge.className = `discord-id-required-badge ${valid ? "ok" : "pending"}`;
    badge.textContent = valid ? (discordLogin ? "Detectat automat" : "Verificat") : "Obligatoriu";
    return valid;
  };

  paint(existingId);
  input.addEventListener("input", () => { errorBox.classList.remove("show"); paint(input.value); });

  button.addEventListener("click", async () => {
    const value = String(input.value || "").trim();
    if (!DISCORD_ID_RE.test(value)) {
      errorBox.textContent = "Discord ID invalid. Folosește doar ID-ul numeric de 17–20 cifre.";
      errorBox.classList.add("show");
      paint(value);
      input.focus();
      return;
    }
    button.disabled = true;
    errorBox.classList.remove("show");
    try {
      await updateDoc(ref, { discordId: value, updatedAt: serverTimestamp() });
      paint(value);
      if (typeof window.showMessage === "function") window.showMessage("Discord ID a fost salvat cu succes!");
      else {
        errorBox.textContent = "Discord ID a fost salvat cu succes!";
        errorBox.style.display = "block";
        errorBox.style.color = "#caffec";
        setTimeout(() => { errorBox.style.display = "none"; }, 3500);
      }
    } catch (error) {
      console.error("Salvare Discord ID:", error);
      errorBox.textContent = error?.code === "permission-denied" ? "Nu ai permisiunea de a modifica profilul." : `Nu am putut salva Discord ID: ${error?.message || "eroare"}`;
      errorBox.classList.add("show");
    } finally {
      button.disabled = false;
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
