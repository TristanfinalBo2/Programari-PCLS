// Legacy compatibility shim.
// User management is now handled by gestionare-utilizatori-v2.js using the
// Discord cookie session and /api/user-management. Keeping this module inert
// prevents a second Firebase-auth listener from hiding or replacing the UI.
export {};
