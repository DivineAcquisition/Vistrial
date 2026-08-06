"use client";

import { useActionState } from "react";

import { resolveInboundEvent, type ActionState } from "@/app/(app)/settings/actions";
import { Panel } from "@/components/ui/panel";
import { TonePill, type Tone } from "@/components/ui/tone";
import { formatDateTime } from "@/lib/format";
import { btnPrimary, btnSecondary, btnSizeSm, selectClass } from "@/lib/ui";
import type { InboundEventStatus } from "@/types/database";

export type UnresolvedEventView = {
  id: string;
  receivedAt: string;
  declaredType: string | null;
  status: InboundEventStatus;
  statusLabel: string;
  clientName: string | null;
  note: string | null;
  payload: string;
};

const STATUS_TONES: Record<string, Tone> = {
  unattributed: "critical",
  unknown: "warning",
  unclassified: "warning",
  failed: "critical",
};

export function UnresolvedEvents({
  events,
  clients,
}: {
  events: UnresolvedEventView[];
  clients: { id: string; name: string }[];
}) {
  if (events.length === 0) {
    return (
      <Panel className="px-5 py-6 text-center">
        <p className="text-sm text-silver">
          Nothing waiting. Every event that arrived was attributed to a client and
          recognised.
        </p>
      </Panel>
    );
  }

  return (
    <ul className="space-y-3">
      {events.map((event) => (
        <EventCard key={event.id} event={event} clients={clients} />
      ))}
    </ul>
  );
}

function EventCard({
  event,
  clients,
}: {
  event: UnresolvedEventView;
  clients: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    resolveInboundEvent,
    null
  );

  const needsClient = event.clientName === null;
  const canClassify = event.status === "unclassified" || event.status === "unknown";

  return (
    <Panel as="li" className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <TonePill tone={STATUS_TONES[event.status] ?? "neutral"}>
          {event.statusLabel}
        </TonePill>
        <span className="text-sm text-silver">
          {event.declaredType ?? "No type declared"}
        </span>
        <span className="text-xs text-dim tabular-nums">
          {formatDateTime(event.receivedAt)}
        </span>
        <span className="ml-auto text-xs text-dim">
          {event.clientName ?? "No client resolved"}
        </span>
      </div>

      {event.note ? (
        <p className="mt-2.5 text-sm leading-relaxed text-silver">
          {event.note}
        </p>
      ) : null}

      <details className="mt-3 rounded-xl border border-border bg-white/[0.02]">
        <summary className="cursor-pointer px-3.5 py-2.5 text-sm text-silver select-none">
          Payload
        </summary>
        <pre className="max-h-72 overflow-auto border-t border-border px-3.5 py-3 text-xs leading-relaxed text-silver">
          {event.payload}
        </pre>
      </details>

      <form action={action} className="mt-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="eventId" value={event.id} />

        {needsClient ? (
          <select
            name="clientId"
            aria-label="Client"
            className={`${selectClass} w-auto min-w-48`}
            defaultValue={clients[0]?.id ?? ""}
          >
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        ) : null}

        {needsClient ? (
          <button
            type="submit"
            name="intent"
            value="assign"
            className={`${btnPrimary} ${btnSizeSm}`}
            disabled={pending}
          >
            Assign and process
          </button>
        ) : null}

        {canClassify ? (
          <>
            <button
              type="submit"
              name="intent"
              value="system_touch"
              className={`${btnSecondary} ${btnSizeSm}`}
              disabled={pending}
            >
              Stamp as system touch
            </button>
            <button
              type="submit"
              name="intent"
              value="human_touch"
              className={`${btnSecondary} ${btnSizeSm}`}
              disabled={pending}
            >
              Stamp as human touch
            </button>
          </>
        ) : null}

        {event.status === "failed" ? (
          <button
            type="submit"
            name="intent"
            value="retry"
            className={`${btnSecondary} ${btnSizeSm}`}
            disabled={pending}
          >
            Retry
          </button>
        ) : null}

        <button
          type="submit"
          name="intent"
          value="dismiss"
          className={`${btnSecondary} ${btnSizeSm}`}
          disabled={pending}
        >
          Dismiss
        </button>

        {state ? (
          <TonePill tone={state.ok ? "good" : "critical"}>{state.message}</TonePill>
        ) : null}
      </form>
    </Panel>
  );
}
