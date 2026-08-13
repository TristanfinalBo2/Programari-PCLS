import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, linkWithPopup, OAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DISCORD_ID_RE = /^\d{17,20}$/;
const DISCORD_PROVIDER = "oidc.oidc.discord";

function injectStyles() {
  if (document.getElementById("discord-id-profile-style")) return;
  const style = document.createElement("style");
  style.id = "discord-id-profile-style";
  style.textContent = `
    .discord-id-card{margin-top:16px;padding:20px;border-radius:22px;border:1px solid rgba(124,231,255,.12);background:linear-gradient(145deg,rgba(124,231,255,.035),rgba(255,255,255,.015));box-shadow:inset 0 1px rgba(255,255,255,.03)}
    .discord-id-card.verified{border-color:rgba(104,242,192,.18);background:linear-gradient(145deg,rgba(104,242,192,.045),rgba(255,255,255,.015))}
    .discord-id-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.discord-id-title{font-size:.94rem;font-weight:800}.discord-id-copy{margin-top:5px;max-width:700px;color:var(--text-3);font-size:.7rem;line-height:1.55}
    .discord-id-badge{display:inline-flex;align-items:center;gap:6px;min-height:24px;padding:0 9px;border-radius:999px;font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}.discord-id-badge::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}.discord-id-badge.pending{color:#ffe39a;background:rgba(255,214,10,.07);border:1px solid rgba(255,214,10,.12)}.discord-id-badge.verified{color:#caffec;background:rgba(104,242,192,.07);border:1px solid rgba(104,242,192,.12)}
    .discord-id-grid{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:end;margin-top:15px}.discord-id-input{min-width:0}.discord-id-input .input-shell{padding:1px;border-radius:18px;background:linear-gradient(120deg,rgba(255,255,255,.07),rgba(124,231,255,.035),rgba(167,124,255,.03))}.discord-id-input input{width:100%;min-height:50px;border:0;border-radius:17px;padding:0 16px;color:var(--text);background:rgba(3,7,14,.98);font:inherit;outline:none}.discord-id-button{min-height:50px;padding:0 17px;border-radius:15px;border:1px solid rgba(124,231,255,.18);background:linear-gradient(110deg,rgba(76,141,255,.82),rgba(145,117,238,.76));color:#fff;font:inherit;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;cursor:pointer}.discord-id-button.secondary{background:rgba(255,255,255,.045);border-color:rgba(255,255,255,.08);color:var(--text-2)}.discord-id-button:disabled{opacity:.55;cursor:not-allowed}.discord-id-help{margin-top:7px;color:var(--text-3);font-size:.62rem}.discord-id-result{min-height:18px;margin-top:10px;font-size:.7rem;color:var(--text-2)}.discord-id-result.ok{color:#caffec}.discord-id-result.err{color:#ffd5dc}.discord-id-greeting{display:none;margin-top:12px;padding:12px 13px;border-radius:14px;background:rgba(104,242,192,.05);border:1px solid rgba(104,242,192,.11);color:#d9fff0;font-size:.76rem}.discord-id-greeting.show{display:block}
    @media(max-width:760px){.discord-id-head{flex-direction:column}.discord-id-grid{grid-template-columns:1fr}.discord-id-button{width:100%}}
  `;
  document.head.appendChild(style);
}

function getDiscordProviderData(user) {
  return user?.providerData?.find(p => p.providerId === DISCORD_PROVIDER || String(p.providerId || "").includes("discord")) || null;
}

async function init() {
  if (!getApps().length) return;
  injectStyles();
  const auth = getAuth(getApp());
  const user = auth.currentUser;
  if (!user) return;

  const db = getFirestore(getApp());
  const ref = doc(db, "utilizatori", user.uid);
  let profileData = {};
  try {
    const snap = await getDoc(ref);
    profileData = snap.exists() ? snap.data() || {} : {};
  } catch (error) {
    console.error("Discord ID profil:", error);
  }

  const providerData = getDiscordProviderData(user);
  const providerId = String(providerData?.uid || "").trim();
  let savedId = String(profileData.discordId || profileData.discord_id || "").trim();
  const savedVerifiedName = String(profileData.discordVerifiedName || profileData.discordName || "").trim();
  const alreadyVerified = profileData.discordVerified === true && DISCORD_ID_RE.test(savedId) && !!savedVerifiedName;
  const autoVerified = DISCORD_ID_RE.test(providerId);

  if (autoVerified && savedId !== providerId) {
    savedId = providerId;
    try {
      await setDoc(ref, { discordId: providerId, discordVerified: true, discordVerifiedName: providerData.displayName || user.displayName || "Discord user", discordName: providerData.displayName || user.displayName || "Discord user", updatedAt: serverTimestamp() }, { merge: true });
    } catch (error) {
      console.warn("Nu am putut sincroniza Discord ID:", error?.message || error);
    }
  }

  let card = document.getElementById("discord-id-verification-card");
  if (!card) {
    card = document.createElement("section");
    card.id = "discord-id-verification-card";
    card.className = "settings-card discord-id-card";
    card.innerHTML = `
      <div class="discord-id-head">
        <div><div class="discord-id-title">Identificare și verificare Discord</div><div class="discord-id-copy">Pentru conturile create cu email, introdu Discord ID-ul și verifică-l o singură dată prin Discord. După legare, verificările viitoare sunt automate. Pentru conturile autentificate deja prin Discord, ID-ul este preluat automat.</div></div>
        <span id="discord-id-badge" class="discord-id-badge pending">Neverificat</span>
      </div>
      <div class="discord-id-grid">
        <div class="discord-id-input"><div class="input-shell"><input id="discordIdInput" inputmode="numeric" autocomplete="off" maxlength="20" placeholder="Ex.: 123456789012345678"></div><div class="discord-id-help">ID-ul Discord trebuie să conțină 17–20 cifre.</div></div>
        <button id="discordIdVerify" class="discord-id-button" type="button">Verifică automat</button>
        <button id="discordIdSave" class="discord-id-button secondary" type="button">Salvează ID</button>
      </div>
      <div id="discordIdResult" class="discord-id-result"></div>
      <div id="discordIdGreeting" class="discord-id-greeting"></div>`;
    const profileCard = document.querySelector("#profileForm")?.closest(".settings-card");
    if (profileCard?.parentElement) profileCard.insertAdjacentElement("afterend", card);
    else document.querySelector(".content")?.prepend(card);
  }

  const input = card.querySelector("#discordIdInput");
  const verifyButton = card.querySelector("#discordIdVerify");
  const saveButton = card.querySelector("#discordIdSave");
  const badge = card.querySelector("#discord-id-badge");
  const result = card.querySelector("#discordIdResult");
  const greeting = card.querySelector("#discordIdGreeting");
  if (!input || !verifyButton || !saveButton || !badge || !result || !greeting) return;

  input.value = savedId;

  const paint = (id, name = "") => {
    const valid = DISCORD_ID_RE.test(String(id || "").trim());
    const verified = valid && !!name;
    card.classList.toggle("verified", verified);
    badge.className = `discord-id-badge ${verified ? "verified" : "pending"}`;
    badge.textContent = verified ? "Verificat" : "Neverificat";
    if (verified) {
      greeting.textContent = `✓ Salut, ${name}! Discord ID-ul ${id} a fost verificat și asociat contului tău.`;
      greeting.classList.add("show");
    } else {
      greeting.classList.remove("show");
    }
    return valid;
  };

  const isVerifiedNow = autoVerified || alreadyVerified;
  const knownName = autoVerified
    ? (providerData.displayName || user.displayName || "utilizator Discord")
    : savedVerifiedName;

  if (isVerifiedNow) {
    paint(savedId, knownName);
    verifyButton.textContent = "Verifică automat";
  } else {
    paint(savedId, "");
    verifyButton.textContent = "Leagă și verifică Discord";
  }

  input.addEventListener("input", () => {
    result.textContent = "";
    result.className = "discord-id-result";
    if (autoVerified) paint(input.value, providerData.displayName || user.displayName || "utilizator Discord");
    else if (alreadyVerified && input.value.trim() === savedId) paint(input.value, savedVerifiedName);
    else paint(input.value, "");
  });

  saveButton.addEventListener("click", async () => {
    const id = String(input.value || "").trim();
    if (!DISCORD_ID_RE.test(id)) {
      result.textContent = "Discord ID invalid. Introdu doar 17–20 cifre.";
      result.className = "discord-id-result err";
      return;
    }
    saveButton.disabled = true;
    try {
      await setDoc(ref, { discordId: id, updatedAt: serverTimestamp() }, { merge: true });
      savedId = id;
      result.textContent = "Discord ID salvat. Pentru validarea identității, folosește verificarea Discord o singură dată.";
      result.className = "discord-id-result ok";
      paint(id, alreadyVerified && savedVerifiedName ? savedVerifiedName : "");
    } catch (error) {
      result.textContent = error?.code === "permission-denied" ? "Nu ai permisiunea de a modifica profilul." : `Eroare la salvare: ${error?.message || "necunoscută"}`;
      result.className = "discord-id-result err";
    } finally { saveButton.disabled = false; }
  });

  verifyButton.addEventListener("click", async () => {
    const enteredId = String(input.value || "").trim();
    if (!DISCORD_ID_RE.test(enteredId)) {
      result.textContent = "Introdu mai întâi un Discord ID valid de 17–20 cifre.";
      result.className = "discord-id-result err";
      return;
    }

    verifyButton.disabled = true;
    saveButton.disabled = true;
    result.className = "discord-id-result";

    try {
      const current = getAuth(getApp()).currentUser;
      if (!current) throw new Error("Sesiunea a expirat. Autentifică-te din nou.");

      // 1. Dacă Discord este deja legat, verificarea este complet automată.
      const linked = getDiscordProviderData(current);
      const linkedId = String(linked?.uid || "").trim();
      const linkedName = String(linked?.displayName || current.displayName || "Discord user").trim();

      if (DISCORD_ID_RE.test(linkedId)) {
        if (linkedId !== enteredId) {
          result.textContent = "Discord ID introdus nu corespunde contului Discord deja legat de acest cont Firebase.";
          result.className = "discord-id-result err";
          return;
        }

        await setDoc(ref, { discordId: linkedId, discordVerified: true, discordVerifiedName: linkedName, discordVerifiedAt: serverTimestamp(), discordName: linkedName, updatedAt: serverTimestamp() }, { merge: true });
        savedId = linkedId;
        result.textContent = "Verificare automată finalizată cu succes.";
        result.className = "discord-id-result ok";
        paint(linkedId, linkedName);
        return;
      }

      // 2. Dacă a fost deja verificat în trecut, nu mai cerem popup-ul.
      if (profileData.discordVerified === true && enteredId === savedId && savedVerifiedName) {
        result.textContent = "Discord ID este deja verificat pentru acest cont.";
        result.className = "discord-id-result ok";
        paint(enteredId, savedVerifiedName);
        return;
      }

      // 3. Prima verificare pentru un cont email: singura autorizare Discord necesară.
      result.textContent = "Este necesară o singură conectare Discord pentru verificarea inițială…";
      const provider = new OAuthProvider(DISCORD_PROVIDER);
      provider.addScope("identify");
      const credentialResult = await linkWithPopup(current, provider);
      const verifiedUser = credentialResult.user;
      const verifiedProvider = getDiscordProviderData(verifiedUser);
      const verifiedId = String(verifiedProvider?.uid || "").trim();
      const verifiedName = String(verifiedProvider?.displayName || verifiedUser.displayName || "Discord user").trim();

      if (!DISCORD_ID_RE.test(verifiedId)) throw new Error("Discord nu a furnizat un ID valid.");
      if (verifiedId !== enteredId) {
        result.textContent = `ID-ul introdus nu corespunde contului Discord autentificat.`;
        result.className = "discord-id-result err";
        return;
      }

      await setDoc(ref, { discordId: verifiedId, discordVerified: true, discordVerifiedName: verifiedName, discordVerifiedAt: serverTimestamp(), discordName: verifiedName, updatedAt: serverTimestamp() }, { merge: true });
      savedId = verifiedId;
      result.textContent = "Discord a fost verificat și asociat. De acum verificarea este automată.";
      result.className = "discord-id-result ok";
      paint(verifiedId, verifiedName);
    } catch (error) {
      console.error("Verificare Discord:", error);
      result.textContent = error?.code === "auth/credential-already-in-use" ? "Acest cont Discord este deja asociat unui alt cont." : `Verificarea a eșuat: ${error?.message || "eroare necunoscută"}`;
      result.className = "discord-id-result err";
    } finally {
      verifyButton.disabled = false;
      saveButton.disabled = false;
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
