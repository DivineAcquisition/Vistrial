"use client";

import { useState, useTransition } from "react";

import { previewRoute, saveRoutingSettings, setMyAvailability } from "@/lib/routing/settings-actions";

const MODES = [
  ["manual", "Manually"],
  ["round_robin", "Round robin"],
  ["weighted_round_robin", "Weighted round robin"],
  ["least_loaded", "Least loaded"],
  ["rules", "Rules first"],
  ["by_source", "By lead source"],
  ["by_service", "By service type"],
] as const;

export function RoutingForm({ staff }: { staff: boolean }) {
  const [mode, setMode] = useState("manual");
  const [sticky, setSticky] = useState("30");
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <form
        className="space-y-4 rounded-lg border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await saveRoutingSettings({ mode, stickyDays: Number(sticky) });
            setMessage(result.ok ? "Saved." : result.error);
          });
        }}
      >
        <label className="block text-sm">
          How new leads are assigned
          <select className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-3" value={mode} onChange={(event) => setMode(event.target.value)}>
            {MODES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Send a returning lead to the same person for this many days. Zero turns it off.
          <input className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-3" value={sticky} onChange={(event) => setSticky(event.target.value)} inputMode="numeric" />
        </label>
        <button className="rounded-md border border-border px-4 py-3 text-sm" type="submit" disabled={pending}>Save</button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </form>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-border px-4 py-3 text-sm"
          onClick={() => startTransition(async () => {
            const result = await setMyAvailability(true);
            setMessage(result.ok ? "You are away. New leads will skip you." : result.error);
          })}
        >
          I am away
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-4 py-3 text-sm"
          onClick={() => startTransition(async () => {
            const result = await setMyAvailability(false);
            setMessage(result.ok ? "You are available." : result.error);
          })}
        >
          I am available
        </button>
      </div>

      <form
        className="space-y-3 rounded-lg border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await previewRoute({
              source: String(data.get("source") ?? ""),
              service: String(data.get("service") ?? ""),
            });
            setPreview(result.ok ? `${result.explanation} Next ten: ${result.next.join(", ")}` : result.error);
          });
        }}
      >
        <h2 className="text-sm font-semibold">Try a lead</h2>
        <p className="text-sm text-muted-foreground">This does not assign a real lead.</p>
        <input name="source" className="w-full rounded-md border border-border bg-transparent px-3 py-3" placeholder="Source, such as web" />
        <input name="service" className="w-full rounded-md border border-border bg-transparent px-3 py-3" placeholder="Service, if you use one" />
        <button className="rounded-md border border-border px-4 py-3 text-sm" type="submit" disabled={pending}>See who would get it</button>
        {preview ? <p className="text-sm">{preview}</p> : null}
      </form>

      {staff ? (
        <p className="text-sm text-muted-foreground">
          Pools, weights, and capacity are saved with the routing settings. People who are away are skipped and do not receive a backlog when they return. Automatic claim and automatic reassignment stay off until you turn them on here by setting those fields in configuration.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Round robin remembers whose turn it is. Someone who was away does not get a pile of leads when they come back.
        </p>
      )}
    </div>
  );
}
