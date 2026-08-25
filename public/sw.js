self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("vistrial-static-v1").then((cache) =>
      cache.addAll([
        "/icons/icon-192.png",
        "/icons/icon-512.png",
        "/icons/apple-touch-icon.png",
        "/brand/vistrial-crest.png",
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || "Vistrial";
  const body = payload.body || "";
  const href = payload.href || "/app/queue";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { href, nid: payload.nid },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/app/queue";
  event.waitUntil(openExact(href));
});

self.addEventListener("sync", (event) => {
  if (event.tag === "outcome-sync") {
    event.waitUntil(flushOutcomes());
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "outcome-sync") {
    event.waitUntil(flushOutcomes());
  }
});

async function openExact(href) {
  const url = new URL(href, self.location.origin).href;
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    if ("focus" in client) {
      await client.focus();
      if ("navigate" in client) {
        await client.navigate(url);
        return;
      }
    }
  }
  await self.clients.openWindow(url);
}

const OUTCOME_DB = "vistrial-outcomes";
const OUTCOME_STORE = "entries";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTCOME_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(OUTCOME_STORE)) {
        request.result.createObjectStore(OUTCOME_STORE, { keyPath: "clientEventId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function flushOutcomes() {
  const db = await openDb();
  const entries = await new Promise((resolve, reject) => {
    const tx = db.transaction(OUTCOME_STORE, "readonly");
    const req = tx.objectStore(OUTCOME_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  for (const entry of entries) {
    if (!entry || entry.status === "synced") continue;
    try {
      const response = await fetch("/api/outcomes/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: entry.leadId,
          channel: entry.channel,
          direction: entry.direction,
          outcome: entry.outcome,
          note: entry.note,
          actorMemberId: entry.actorMemberId,
          clientEventId: entry.clientEventId,
          clientLoggedAt: entry.clientLoggedAt,
          queuedOffline: true,
          clientSurface: entry.clientSurface,
          expectedLeadStatus: entry.expectedLeadStatus,
          expectedLastTouchAt: entry.expectedLastTouchAt,
          expectedFirstHumanTouchAt: entry.expectedFirstHumanTouchAt,
        }),
      });
      const json = await response.json().catch(() => null);
      if (response.ok && json && json.ok) {
        entry.status = "synced";
        entry.lastError = null;
        entry.discrepancy = json.discrepancy || null;
        entry.syncedAt = new Date().toISOString();
      } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        entry.status = "failed";
        entry.lastError = (json && json.error) || "Could not log that outcome.";
      } else {
        entry.status = "pending";
        entry.lastError = (json && json.error) || "No connection.";
      }
      await new Promise((resolve, reject) => {
        const tx = db.transaction(OUTCOME_STORE, "readwrite");
        const req = tx.objectStore(OUTCOME_STORE).put(entry);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Stay pending. The next online event or app open retries.
    }
  }
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "outcome-sync-complete" });
  }
}
