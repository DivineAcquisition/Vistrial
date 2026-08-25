"use client";

import { disconnectCrm, selectGhlLocation } from "@/app/app/settings/integrations/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import type { WorkspaceConnectionCard } from "./load";
import { SubmitButton } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { helperClass, labelClass } from "@/lib/ui";
import { useActionState } from "react";

const idle: SettingsSaveResult = { status: "idle" };

export function WorkspaceLocationPicker({
  locations,
}: {
  locations: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(selectGhlLocation, idle);
  return (
    <form action={action} className="space-y-3">
      <label className={labelClass} htmlFor="workspace-location">
        Location
      </label>
      <Select id="workspace-location" name="location_id" required defaultValue="">
        <option value="" disabled>
          Select a location
        </option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </Select>
      <SubmitButton pending={pending} loadingLabel="Linking">
        Link location
      </SubmitButton>
      {state.status === "error" ? <p className="text-sm text-flag-critical">{state.error}</p> : null}
    </form>
  );
}

export function WorkspaceConnections({
  cards,
  ghlStatus,
  oauthConfigured,
}: {
  cards: WorkspaceConnectionCard[];
  ghlStatus: "active" | "broken" | "inactive" | "missing";
  oauthConfigured: boolean;
}) {
  const [disconnectState, disconnectAction, disconnecting] = useActionState(disconnectCrm, idle);

  return (
    <div className="space-y-4">
      {cards.map((card) => (
        <article key={card.key} className="rounded-2xl border border-white/10 p-4">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <strong className="text-white">{card.title}</strong>
            <StatusBadge
              label={
                !card.connected
                  ? "Not connected"
                  : card.healthy
                    ? "Connected · Healthy"
                    : "Connected · Unhealthy"
              }
              tone={!card.connected ? "neutral" : card.healthy ? "good" : "critical"}
            />
          </header>
          <p className={`mt-2 ${helperClass}`}>
            {card.lastReceivedLabel
              ? `Last received ${card.lastReceivedLabel}`
              : card.connected
                ? "No inbound events recorded yet"
                : "Nothing received"}
          </p>
          {card.key === "ghl" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {oauthConfigured ? (
                <a href="/api/ghl/oauth/start" className="text-sm text-white underline">
                  {ghlStatus === "active" || ghlStatus === "broken" ? "Reconnect" : "Connect GoHighLevel"}
                </a>
              ) : (
                <p className={helperClass}>Marketplace credentials are not configured on this deployment.</p>
              )}
              {ghlStatus === "active" || ghlStatus === "broken" ? (
                <form action={disconnectAction}>
                  <SubmitButton variant="secondary" size="sm" pending={disconnecting} loadingLabel="Disconnecting">
                    Disconnect
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          ) : null}
          {(card.key === "slack" || card.key === "teams" || card.key === "sms") && !card.connected ? (
            <p className={`mt-2 ${helperClass}`}>
              Channel credentials are configured in{" "}
              <a href="/app/settings/advanced/integrations" className="text-white underline">
                Advanced integrations
              </a>
              .
            </p>
          ) : null}
        </article>
      ))}
      {disconnectState.status === "error" ? (
        <p className="text-sm text-flag-critical">{disconnectState.error}</p>
      ) : null}
    </div>
  );
}
