"use client";

import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import { helperClass, successClass, errorClass } from "@/lib/ui";
import { vapidPublicKey } from "@/lib/notifications/vapid-public";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function PushEnable() {
  const [status, setStatus] = useState<"idle" | "on" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const key = vapidPublicKey();

  async function enable(next: boolean) {
    setError(null);
    if (!next) {
      const existing = await navigator.serviceWorker.getRegistration("/");
      const sub = await existing?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/notifications/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("idle");
      return;
    }
    if (!key) {
      setError("Push keys are not configured on this deployment.");
      setStatus("error");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setError("This browser does not support push.");
      setStatus("error");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setError("Permission was not granted.");
      setStatus("error");
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });
    const json = subscription.toJSON();
    const response = await fetch("/api/notifications/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    });
    if (!response.ok) {
      setError("Could not save the subscription.");
      setStatus("error");
      return;
    }
    setStatus("on");
  }

  return (
    <div>
      <Switch
        label="Enable push on this device"
        description="Time-sensitive alerts assigned to you. The inbox still records them if this is off."
        checked={status === "on"}
        onChange={(event) => {
          void enable(event.target.checked);
        }}
      />
      {status === "on" ? <p className={successClass}>This device will receive push.</p> : null}
      {error ? <p className={errorClass}>{error}</p> : null}
      {!key ? <p className={helperClass}>VAPID keys are missing, so push cannot be enabled yet.</p> : null}
    </div>
  );
}
