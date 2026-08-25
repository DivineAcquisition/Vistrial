self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || "Vistrial";
  const body = payload.body || "";
  const href = payload.href || "/app/queue";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { href, nid: payload.nid },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/app/queue";
  event.waitUntil(self.clients.openWindow(href));
});
