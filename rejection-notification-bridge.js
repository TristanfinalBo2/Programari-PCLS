// Disabled intentionally.
// The portal's index notification popup listens directly to `cereri` status updates,
// so this bridge must not query `notificari.recipientDiscordId` (which is not part of
// the primary notification flow and requires separate Firestore read permissions).
export {};