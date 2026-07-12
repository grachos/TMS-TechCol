/**
 * Light TMS - Service worker for Web Push.
 *
 * Deliberately minimal: no offline caching, just push delivery. The browser
 * keeps this running (or wakes it) even when no tab is open, which is what
 * lets a phone get notified without the app being in the foreground.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Light TMS', body: event.data.text() };
  }
  const { title, body, url, tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title || 'Light TMS', {
      body,
      tag,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
