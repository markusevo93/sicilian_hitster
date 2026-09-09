// Minimaler Service Worker — nur nötig, damit Chrome/Android die Seite
// als installierbare PWA erkennt. Kein echtes Offline-Caching.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // no-op, macht sw "aktiv"
