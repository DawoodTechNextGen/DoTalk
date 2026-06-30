// DoTalk — Single Unified Service Worker
// VitePWA injectManifest mode: Workbox injects precache manifest here at build time.
// This file handles BOTH caching AND push notifications — no conflicts.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// Workbox injected precache manifest (populated at build time by VitePWA)
precacheAndRoute(self.__WB_MANIFEST);

// Remove old cached assets when SW updates
cleanupOutdatedCaches();

// ─── Install — Activate immediately ───────────────────────────────────────────
self.addEventListener('install', function () {
  self.skipWaiting();
});

// ─── Activate — Take control of all pages right away ─────────────────────────
self.addEventListener('activate', function (event) {
  event.waitUntil(clients.claim());
});

// ─── Push Notification Handler (WhatsApp/Slack style) ─────────────────────────
self.addEventListener('push', function (event) {
  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification('DoTalk', {
        body: 'You have a new message',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      })
    );
    return;
  }

  var data;
  try {
    data = event.data.json();
  } catch (err) {
    data = {
      title: 'DoTalk',
      body: event.data.text() || 'You have a new message',
      url: '/',
    };
  }

  var title = data.title || 'DoTalk';
  var body = data.body || 'You have a new message';
  var url = data.url || '/';

  // Per-sender/group tag: same tag replaces old notification (WhatsApp behavior)
  var tag = data.tag || 'dotalk-message';

  var options = {
    body: body,
    icon: '/icon-192.png',         // App icon shown in the notification
    badge: '/icon-192.png',        // Small monochrome icon in Android status bar
    tag: tag,                       // Same sender = replace old notification, don't stack
    renotify: true,                 // Re-alert (vibrate + sound) even if same tag
    requireInteraction: false,      // Let OS decide when to dismiss
    silent: false,                  // Allow system notification sound
    vibrate: [200, 100, 200, 100, 400], // WhatsApp-style buzz pattern
    timestamp: data.timestamp || Date.now(),
    data: { url: url },
    actions: [
      { action: 'open',    title: '\uD83D\uDCAC Open Chat' },
      { action: 'dismiss', title: '\u2715 Dismiss'     },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── Notification Click Handler ────────────────────────────────────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  // User tapped Dismiss — do nothing
  if (event.action === 'dismiss') return;

  var targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (windowClients) {
        // Focus an existing tab and navigate it
        for (var i = 0; i < windowClients.length; i++) {
          var client = windowClients[i];
          if ('focus' in client) {
            if ('navigate' in client) client.navigate(targetUrl);
            return client.focus();
          }
        }
        // No existing tab — open fresh window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// ─── Notification Close (analytics hook) ──────────────────────────────────────
self.addEventListener('notificationclose', function () {
  // Reserved for future analytics
});
