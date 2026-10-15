const CACHE = "vistrial-shell-v2";
const SHELL = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/brand/vistrial-crest.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "skip-waiting") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "clear-outcomes") {
    event.waitUntil(clearOutcomes());
  }
  if (event.data && event.data.type === "outcome-sync") {
    event.waitUntil(flushOutcomes());
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  event.respondWith(
    fetch(request).catch(async () => (await caches.match("/offline.html")) || new Response("Offline", { status: 503 }))
  );
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || "Vistrial";
  const body = payload.body || "";
  const href = payload.href || "/app";
  const tag = payload.tag || payload.nid || "vistrial";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: false,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { href, nid: payload.nid },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/app";
  event.waitUntil(openExact(href));
});

self.addEventListener("sync", (event) => {
  if (event.tag === "outcome-sync") event.waitUntil(flushOutcomes());
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
const OUTCOME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTCOME_DB, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(OUTCOME_STORE)) db.deleteObjectStore(OUTCOME_STORE);
      db.createObjectStore(OUTCOME_STORE, { keyPath: "clientEventId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearOutcomes() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(OUTCOME_STORE, "readwrite");
    const req = tx.objectStore(OUTCOME_STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
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
    const at = Date.parse(entry.createdAt || entry.clientLoggedAt || "");
    if (Number.isFinite(at) && Date.now() - at > OUTCOME_MAX_AGE_MS) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(OUTCOME_STORE, "readwrite");
        const req = tx.objectStore(OUTCOME_STORE).delete(entry.clientEventId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      continue;
    }
    const kept = {
      clientEventId: entry.clientEventId,
      leadId: entry.leadId,
      outcome: entry.outcome,
      clientLoggedAt: entry.clientLoggedAt,
      status: entry.status || "pending",
      lastError: entry.lastError || null,
      createdAt: entry.createdAt || entry.clientLoggedAt,
      syncedAt: entry.syncedAt || null,
    };
    try {
      const response = await fetch("/api/outcomes/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: kept.leadId,
          outcome: kept.outcome,
          clientEventId: kept.clientEventId,
          clientLoggedAt: kept.clientLoggedAt,
          queuedOffline: true,
        }),
      });
      const json = await response.json().catch(() => null);
      if (response.ok && json && json.ok) {
        kept.status = "synced";
        kept.lastError = null;
        kept.syncedAt = new Date().toISOString();
      } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        kept.status = "failed";
        kept.lastError = (json && json.error) || "Could not log that outcome.";
      } else {
        kept.status = "pending";
        kept.lastError = (json && json.error) || "No connection.";
      }
      await new Promise((resolve, reject) => {
        const tx = db.transaction(OUTCOME_STORE, "readwrite");
        const req = tx.objectStore(OUTCOME_STORE).put(kept);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Stay pending. The next online event retries.
    }
  }
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: "outcome-sync-complete" });
}
