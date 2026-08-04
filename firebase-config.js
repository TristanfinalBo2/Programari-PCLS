import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBst9kibZtc9Cx-KgJ21XcZUkouRtDI1Sc",
  authDomain: "pcls-portal.firebaseapp.com",
  projectId: "pcls-portal",
  storageBucket: "pcls-portal.firebasestorage.app",
  messagingSenderId: "914128618803",
  appId: "1:914128618803:web:09f5321ff58e246c056a46",
  measurementId: "G-TLLV67QCWR"
};

// Inițializare Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Logică UI Header
document.addEventListener('DOMContentLoaded', () => {
    // Caută noul container (auth-section-premium) sau pe cel vechi (auth-links)
    const authContainer = document.getElementById('auth-section-premium') || document.getElementById('auth-links');
    
    if (authContainer) {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const emailPart = user.email ? user.email.split('@')[0] : "User";
                const displayName = user.displayName || (emailPart.charAt(0).toUpperCase() + emailPart.slice(1));
                const initial = displayName.charAt(0).toUpperCase();
                
                let isAdmin = false;

                // Verificăm dacă este email-ul tău de admin sau are rol în Firestore
                if (user.email === "tsplayer18@gmail.com") {
                    isAdmin = true;
                } else {
                    try {
                        // CORECTAT: userDocRef definit corect
                        const userDocRef = doc(db, "utilizatori", user.uid);
                        const userDoc = await getDoc(userDocRef);
                        
                        if (userDoc.exists()) {
                            const data = userDoc.data();
                            const role = (data.role || data.rol || "").toLowerCase();
                            if (["admin", "superadmin", "isuls", "dsls", "mmls", "ssmls"].includes(role)) {
                                isAdmin = true;
                            }
                        }
                    } catch (e) {
                        console.error("Eroare verificare rol admin:", e);
                    }
                }

                // Injectare UI cu Meniu Dropdown și link Setări Cont
                authContainer.innerHTML = `
                    <div class="user-profile-premium">
                        <button class="profile-btn-premium" id="profileToggle" type="button">
                            <span>Salut, ${displayName}</span>
                            <div class="profile-avatar">${initial}</div>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>
                        
                        <div class="profile-dropdown-premium" id="profileDropdown">
                            <div class="dropdown-user-info">
                                <span>Conectat cu adresa</span>
                                <strong>${user.email ? displayName : 'Discord: ' + displayName}</strong>
                            </div>
                            
                            <div class="dropdown-divider"></div>

                            ${isAdmin ? `
                            <a href="admin.html" class="dropdown-item-premium">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                                Admin Panel
                            </a>` : ''}
                            
                            <a href="setari.html" class="dropdown-item-premium">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                                Setări cont
                            </a>

                            <div class="dropdown-divider"></div>

                            <button id="btnLogout" class="dropdown-item-premium" style="color: #ff6b6b; background: none; border: none; width: 100%; text-align: left; cursor: pointer;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                                Deconectare
                            </button>
                        </div>
                    </div>
                `;

                // Evenimente pentru deschidere/închidere dropdown
                const profileToggle = document.getElementById("profileToggle");
                const profileDropdown = document.getElementById("profileDropdown");

                if (profileToggle && profileDropdown) {
                    profileToggle.addEventListener("click", (e) => {
                        e.stopPropagation(); 
                        profileDropdown.classList.toggle("show");
                    });

                    document.addEventListener("click", (e) => {
                        if (!profileToggle.contains(e.target) && !profileDropdown.contains(e.target)) {
                            profileDropdown.classList.remove("show");
                        }
                    });
                }

                // Deconectare
                const btnLogout = document.getElementById('btnLogout');
                if (btnLogout) {
                    btnLogout.addEventListener('click', () => {
                        signOut(auth).then(() => {
                            window.location.reload();
                        });
                    });
                }

            } else {
                // Utilizator nelogat
                authContainer.innerHTML = `
                    <a href="auth.html" style="color: #35f2ad; text-decoration: none; font-weight: bold; border: 1px solid rgba(53,242,173,0.3); padding: 8px 16px; border-radius: 99px; background: rgba(53,242,173,0.05); font-size: 0.9rem;">Autentificare</a>
                `;
            }
        });
    }
});