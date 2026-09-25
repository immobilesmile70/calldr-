// CalLdr Service Worker for Background Incoming Call Notifications & PWA
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming Web Push (if configured via push server)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const { title, body, roomId, callerName, video, durationSec } = payload;

    const options = {
      body: body || `${callerName || 'Someone'} is calling you...`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `incoming-call-${roomId || 'general'}`,
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200, 100, 400],
      data: {
        roomId,
        callerName,
        video,
        durationSec,
      },
      actions: [
        { action: 'accept', title: 'Accept' },
        { action: 'decline', title: 'Decline' },
      ],
    };

    event.waitUntil(self.registration.showNotification(title || 'Incoming Call — CalLdr', options));
  } catch (err) {
    console.error('[SW] Error parsing push data:', err);
  }
});

// Handle notification click and action buttons
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Find an existing focused or open window
      const focusedClient = windowClients.find((c) => c.focused);
      const existingClient = focusedClient || windowClients[0];

      if (action === 'decline') {
        // Broadcast decline to open tabs so RTDB incoming is removed
        windowClients.forEach((client) => {
          client.postMessage({ type: 'DECLINE_CALL', roomId: data.roomId });
        });
        return;
      }

      const activeUrl = `/(call)/active?roomId=${encodeURIComponent(data.roomId || '')}&role=callee&contactName=${encodeURIComponent(data.callerName || 'Caller')}&video=${data.video ? 'true' : 'false'}&durationSec=${data.durationSec || 300}`;
      const incomingUrl = `/(call)/incoming?roomId=${encodeURIComponent(data.roomId || '')}&callerName=${encodeURIComponent(data.callerName || 'Caller')}&video=${data.video ? 'true' : 'false'}&durationSec=${data.durationSec || 300}`;

      const targetPath = action === 'accept' ? activeUrl : incomingUrl;

      if (existingClient && 'focus' in existingClient) {
        existingClient.focus();
        if (action === 'accept') {
          existingClient.postMessage({
            type: 'ACCEPT_CALL',
            roomId: data.roomId,
            callerName: data.callerName,
            video: data.video,
            durationSec: data.durationSec,
          });
        }
        if ('navigate' in existingClient) {
          existingClient.navigate(targetPath);
        }
      } else if (self.clients.openWindow) {
        self.clients.openWindow(targetPath);
      }
    })
  );
});

// Message listener from foreground app
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'CLOSE_CALL_NOTIFICATION') {
    const tag = event.data.tag || `incoming-call-${event.data.roomId || ''}`;
    self.registration.getNotifications({ tag }).then((notifications) => {
      notifications.forEach((n) => n.close());
    });
  }
});
