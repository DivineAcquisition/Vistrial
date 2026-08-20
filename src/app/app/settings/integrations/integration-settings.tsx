"use client";

import { useActionState, useState, useTransition } from "react";

import {
  disconnectCrm,
  retryWebhookEvent,
  saveGhlFieldMaps,
  selectGhlLocation,
  saveTranscriptConnection,
  rotateTranscriptWebhookToken,
  pasteUnmatchedTranscript,
  assignUnmatchedTranscript,
  discardUnmatchedTranscript,
  type FieldMapPayload,
} from "@/app/app/settings/integrations/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatRelative } from "@/lib/format";
import { RECORDER_SOURCES } from "@/lib/transcripts/constants";
import { TRANSCRIPT_SOURCE_LABELS } from "@/lib/leads/labels";
import {
  btnPrimary,
  btnSecondary,
  btnSizeMd,
  btnSizeSm,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";
import type { Tone } from "@/components/ui/tone";

export type IntegrationFieldMap = FieldMapPayload & { id: string };
export type CustomFieldOption = { id: string; name: string; key?: string };
export type LocationOption = { id: string; name: string };
export type DeadEvent = {
  id: string;
  eventType: string;
  errorText: string | null;
  receivedAt: string;
};

export type IntegrationSettingsProps = {
  oauthConfigured: boolean;
  selectLocation: boolean;
  locations: LocationOption[];
  connection: {
    status: "active" | "broken" | "inactive" | "missing";
    locationName: string | null;
    lastVerifiedAt: string | null;
    lastSetupError: string | null;
  };
  health: {
    receivedLast24h: Record<string, number>;
    unprocessed: number;
    oldestUnprocessedAgeMs: number | null;
    deadCount: number;
    dead: DeadEvent[];
    lastProcessedAt: string | null;
    lastProcessedAgeMs: number | null;
    stale: boolean;
    staleReason: string | null;
  };
  maps: IntegrationFieldMap[];
  customFields: CustomFieldOption[];
  flash: string | null;
  flashError: string | null;
  now: string;
  appUrl: string;
  transcriptHealth: {
    unmatchedCount: number;
    unmatchedOldestAgeMs: number | null;
    deadExtractions: number;
    connections: Array<{
      source: string;
      publicToken: string;
      lastPullAt: string | null;
      lastPullError: string | null;
      hasWebhookSecret: boolean;
      hasApiKey: boolean;
    }>;
  };
  unmatched: Array<{
    id: string;
    source: string;
    title: string | null;
    occurredAt: string | null;
    receivedAt: string;
    participantEmails: string[];
    providerCallId: string | null;
  }>;
  assignableCalls: Array<{ id: string; label: string }>;
};

const initial: SettingsSaveResult = { status: "idle" };

function statusTone(status: IntegrationSettingsProps["connection"]["status"]): Tone {
  if (status === "active") return "good";
  if (status === "broken") return "critical";
  return "neutral";
}

function statusLabel(status: IntegrationSettingsProps["connection"]["status"]): string {
  if (status === "active") return "Connected";
  if (status === "broken") return "Broken";
  if (status === "inactive") return "Disconnected";
  return "Not connected";
}

export function IntegrationSettings(props: IntegrationSettingsProps) {
  const [disconnectState, disconnectAction, disconnecting] = useActionState(disconnectCrm, initial);
  const [locationState, locationAction, locating] = useActionState(selectGhlLocation, initial);
  const [maps, setMaps] = useState<IntegrationFieldMap[]>(props.maps);
  const [mapStatus, setMapStatus] = useState<SettingsSaveResult>(initial);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [transcriptStatus, setTranscriptStatus] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [assignCallId, setAssignCallId] = useState<Record<string, string>>({});

  const counts = Object.entries(props.health.receivedLast24h).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-8">
      {props.connection.status === "broken" ? (
        <Panel className="border-flag-critical/40 px-6 py-5">
          <p className="text-sm font-semibold text-flag-critical">The CRM connection is broken</p>
          <p className="mt-2 text-sm leading-relaxed text-silver">
            Token refresh failed. Outbound dispatch is halted until an owner or admin reconnects.
            Inbound events still store if the location is linked. This is an emergency for this
            product — reconnect now.
          </p>
        </Panel>
      ) : null}

      {props.connection.lastSetupError ? (
        <Panel className="border-flag-warning/40 px-6 py-5">
          <p className="text-sm font-semibold text-flag-warning">Webhook registration did not finish</p>
          <p className="mt-2 text-sm leading-relaxed text-silver">
            The location is linked, but HighLevel did not accept the webhook subscription. Inbound
            events will not arrive until this is fixed. Reconnect, or check the marketplace app
            webhook URL. Recorded cause: {props.connection.lastSetupError}.
          </p>
        </Panel>
      ) : null}

      {props.connection.status === "active" && props.maps.length === 0 ? (
        <Panel className="border-flag-warning/40 px-6 py-5">
          <p className="text-sm font-semibold text-flag-warning">No application field maps</p>
          <p className="mt-2 text-sm leading-relaxed text-silver">
            Contacts can ingest, but intake scores will stay empty until GHL custom fields are
            mapped onto answer keys. A blank score is not a successful scoring setup.
          </p>
        </Panel>
      ) : null}

      {props.health.stale ? (
        <Panel className="border-flag-warning/40 px-6 py-5">
          <p className="text-sm font-semibold text-flag-warning">Ingestion looks stalled</p>
          <p className="mt-2 text-sm leading-relaxed text-silver">
            {props.health.staleReason ??
              "No event has been processed recently. Leads will not appear until this is fixed."}
          </p>
        </Panel>
      ) : null}

      {props.transcriptHealth.unmatchedCount > 0 ? (
        <Panel className="border-flag-warning/40 px-6 py-5">
          <p className="text-sm font-semibold text-flag-warning">Unmatched transcripts need an operator</p>
          <p className="mt-2 text-sm leading-relaxed text-silver">
            {props.transcriptHealth.unmatchedCount} recording
            {props.transcriptHealth.unmatchedCount === 1 ? "" : "s"} could not be attached to a call.
            Assign them below. Vistrial will not guess.
            {props.transcriptHealth.unmatchedOldestAgeMs !== null
              ? ` Oldest is ${Math.round(props.transcriptHealth.unmatchedOldestAgeMs / 60000)}m old.`
              : ""}
          </p>
        </Panel>
      ) : null}

      {props.flashError ? <p className={errorClass}>{props.flashError}</p> : null}
      {props.flash ? <p className="text-sm text-flag-good">{props.flash}</p> : null}

      {props.selectLocation ? (
        <Panel className="px-6 py-6">
          <h2 className="text-sm font-semibold text-white">Choose a GoHighLevel location</h2>
          <p className={helperClass}>
            Agency access was granted. Link exactly one location to this workspace.
          </p>
          <form action={locationAction} className="mt-4 space-y-4">
            <div>
              <label className={labelClass} htmlFor="location_id">
                Location
              </label>
              <select id="location_id" name="location_id" required className={selectClass} defaultValue="">
                <option value="" disabled>
                  Select a location
                </option>
                {props.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={`${btnPrimary} ${btnSizeMd}`} disabled={locating}>
              {locating ? "Linking…" : "Link location"}
            </button>
            {locationState.status === "error" ? <p className={errorClass}>{locationState.error}</p> : null}
          </form>
        </Panel>
      ) : null}

      <Panel className="px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">GoHighLevel</h2>
            <p className={helperClass}>
              Dispatch goes out through GHL. Conversations stay in GHL — this workspace never
              renders threads or message bodies.
            </p>
          </div>
          <StatusBadge label={statusLabel(props.connection.status)} tone={statusTone(props.connection.status)} />
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className={labelClass}>Linked location</dt>
            <dd className="text-sm text-white">{props.connection.locationName || "—"}</dd>
          </div>
          <div>
            <dt className={labelClass}>Last verified</dt>
            <dd className="text-sm text-white">
              {props.connection.lastVerifiedAt
                ? formatRelative(props.connection.lastVerifiedAt, props.now)
                : "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          {props.oauthConfigured ? (
            <a href="/api/ghl/oauth/start" className={`${btnPrimary} ${btnSizeMd}`}>
              {props.connection.status === "active" || props.connection.status === "broken"
                ? "Reconnect"
                : "Connect GoHighLevel"}
            </a>
          ) : (
            <p className="text-sm text-silver">
              Marketplace credentials are not configured on this deployment, so connect stays
              unavailable.
            </p>
          )}
          {props.connection.status === "active" || props.connection.status === "broken" ? (
            <form action={disconnectAction}>
              <button type="submit" className={`${btnSecondary} ${btnSizeMd}`} disabled={disconnecting}>
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </form>
          ) : null}
        </div>
        {disconnectState.status === "error" ? <p className={errorClass}>{disconnectState.error}</p> : null}
      </Panel>

      <Panel className="px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Ingestion health</h2>
        <p className={helperClass}>
          Events received in the last 24 hours, the unprocessed backlog, and permanently failed
          payloads. A stalled pipeline is worse than an empty one.
        </p>

        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className={labelClass}>Unprocessed</dt>
            <dd className="text-sm text-white">{props.health.unprocessed}</dd>
            <p className={helperClass}>
              Oldest:{" "}
              {props.health.oldestUnprocessedAgeMs === null
                ? "—"
                : `${Math.round(props.health.oldestUnprocessedAgeMs / 60000)}m`}
            </p>
          </div>
          <div>
            <dt className={labelClass}>Unmatched transcripts</dt>
            <dd className="text-sm text-white">{props.transcriptHealth.unmatchedCount}</dd>
            <p className={helperClass}>
              Oldest:{" "}
              {props.transcriptHealth.unmatchedOldestAgeMs === null
                ? "—"
                : `${Math.round(props.transcriptHealth.unmatchedOldestAgeMs / 60000)}m`}
            </p>
          </div>
          <div>
            <dt className={labelClass}>Last processed</dt>
            <dd className="text-sm text-white">
              {props.health.lastProcessedAt
                ? formatRelative(props.health.lastProcessedAt, props.now)
                : "Never"}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Failed permanently</dt>
            <dd className="text-sm text-white">{props.health.deadCount}</dd>
          </div>
          <div>
            <dt className={labelClass}>Failed extractions</dt>
            <dd className="text-sm text-white">{props.transcriptHealth.deadExtractions}</dd>
          </div>
        </dl>

        <div className="mt-6">
          <p className={labelClass}>Last 24 hours by type</p>
          {counts.length === 0 ? (
            <p className="text-sm text-dim">No events received in the last 24 hours.</p>
          ) : (
            <DataTable
              columns={[
                { key: "type", label: "Type" },
                { key: "count", label: "Count", align: "right" },
              ]}
              rows={counts.map(([type, count]) => ({ type, count }))}
            />
          )}
        </div>
      </Panel>

      <Panel className="px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Permanently failed events</h2>
        <p className={helperClass}>
          These stopped retrying. Fix the cause, then retry. Payloads stay stored; message bodies
          are never shown here.
        </p>
        {retryStatus ? <p className="mt-3 text-sm text-silver">{retryStatus}</p> : null}
        <div className="mt-4">
          <DataTable
            columns={[
              { key: "type", label: "Type" },
              { key: "reason", label: "Reason" },
              { key: "when", label: "Received" },
              { key: "action", label: "" },
            ]}
            empty="No permanently failed events."
            rows={props.health.dead.map((event) => ({
              type: event.eventType,
              reason: event.errorText || "—",
              when: formatRelative(event.receivedAt, props.now),
              action: (
                <button
                  type="button"
                  className={`${btnSecondary} ${btnSizeSm}`}
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await retryWebhookEvent(event.id);
                      setRetryStatus(result.status === "error" ? result.error : "Retry queued.");
                    });
                  }}
                >
                  Retry
                </button>
              ),
            }))}
          />
        </div>
      </Panel>

      <Panel className="px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Application field mapping</h2>
        <p className={helperClass}>
          Map this location&apos;s GHL custom fields onto the application answer keys the scoring
          engine already reads. This is data, not code — every client&apos;s GHL is different.
        </p>
        <div className="mt-5 space-y-4">
          {maps.map((map, index) => (
            <div key={map.id} className="grid gap-3 sm:grid-cols-3">
              {props.customFields.length > 0 ? (
                <div>
                  <label className={labelClass}>GHL field</label>
                  <select
                    className={selectClass}
                    value={map.ghlFieldId}
                    onChange={(event) => {
                      const option = props.customFields.find((field) => field.id === event.target.value);
                      setMaps((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index
                            ? {
                                ...row,
                                ghlFieldId: event.target.value,
                                ghlFieldKey: option?.key ?? row.ghlFieldKey,
                              }
                            : row
                        )
                      );
                    }}
                  >
                    <option value="">Choose a field</option>
                    {props.customFields.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className={labelClass}>GHL field id</label>
                  <input
                    className={inputClass}
                    value={map.ghlFieldId}
                    onChange={(event) =>
                      setMaps((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, ghlFieldId: event.target.value } : row
                        )
                      )
                    }
                  />
                </div>
              )}
              <div>
                <label className={labelClass}>GHL field key</label>
                <input
                  className={inputClass}
                  value={map.ghlFieldKey}
                  onChange={(event) =>
                    setMaps((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, ghlFieldKey: event.target.value } : row
                      )
                    )
                  }
                />
              </div>
              <div>
                <label className={labelClass}>Answer key</label>
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    value={map.answerKey}
                    onChange={(event) =>
                      setMaps((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, answerKey: event.target.value } : row
                        )
                      )
                    }
                  />
                  <button
                    type="button"
                    className={`${btnSecondary} ${btnSizeSm}`}
                    onClick={() => setMaps((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={`${btnSecondary} ${btnSizeSm}`}
              onClick={() =>
                setMaps((current) => [
                  ...current,
                  { id: crypto.randomUUID(), ghlFieldId: "", ghlFieldKey: "", answerKey: "" },
                ])
              }
            >
              Add mapping
            </button>
            <button
              type="button"
              className={`${btnPrimary} ${btnSizeSm}`}
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await saveGhlFieldMaps(maps);
                  setMapStatus(result);
                });
              }}
            >
              Save mapping
            </button>
          </div>
          {mapStatus.status === "error" ? <p className={errorClass}>{mapStatus.error}</p> : null}
          {mapStatus.status === "saved" ? (
            <p className="text-sm text-flag-good">Field mapping saved.</p>
          ) : null}
        </div>
      </Panel>

      <Panel className="px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Call recorders</h2>
        <p className={helperClass}>
          Webhooks for Fathom, Fireflies, Zoom, and GHL. Optional API key for scheduled pull.
          Manual paste stays available as the fallback. Audio is never stored.
        </p>
        {transcriptStatus ? <p className="mt-3 text-sm text-silver">{transcriptStatus}</p> : null}
        <div className="mt-5 space-y-6">
          {RECORDER_SOURCES.map((source) => {
            const connection = props.transcriptHealth.connections.find((row) => row.source === source);
            const webhookUrl = connection
              ? `${props.appUrl}/api/transcripts/webhooks/${source}/${connection.publicToken}`
              : null;
            return (
              <form
                key={source}
                className="space-y-3 border-t border-white/[0.06] pt-4 first:border-t-0 first:pt-0"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  startTransition(async () => {
                    const result = await saveTranscriptConnection({
                      source,
                      webhookSecret: String(form.get("webhook_secret") ?? ""),
                      apiKey: String(form.get("api_key") ?? ""),
                    });
                    setTranscriptStatus(result.status === "error" ? result.error : `${TRANSCRIPT_SOURCE_LABELS[source]} saved.`);
                  });
                }}
              >
                <p className="text-sm font-medium text-white">{TRANSCRIPT_SOURCE_LABELS[source]}</p>
                {webhookUrl ? (
                  <p className="text-xs break-all text-dim">Webhook URL: {webhookUrl}</p>
                ) : (
                  <p className="text-xs text-dim">Save a webhook secret to mint the URL.</p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>Webhook secret</span>
                    <input name="webhook_secret" className={inputClass} placeholder={connection?.hasWebhookSecret ? "Unchanged" : ""} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>API key for pull</span>
                    <input name="api_key" className={inputClass} placeholder={connection?.hasApiKey ? "Unchanged" : ""} />
                  </label>
                </div>
                {connection?.lastPullError ? (
                  <p className={errorClass}>Last pull: {connection.lastPullError}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className={`${btnPrimary} ${btnSizeSm}`} disabled={pending}>
                    Save
                  </button>
                  {connection ? (
                    <button
                      type="button"
                      className={`${btnSecondary} ${btnSizeSm}`}
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await rotateTranscriptWebhookToken(source);
                          setTranscriptStatus(
                            result.status === "error" ? result.error : `${TRANSCRIPT_SOURCE_LABELS[source]} webhook URL rotated.`
                          );
                        });
                      }}
                    >
                      Rotate URL
                    </button>
                  ) : null}
                </div>
              </form>
            );
          })}
        </div>
      </Panel>

      <Panel className="px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Unmatched transcripts</h2>
        <p className={helperClass}>
          These did not uniquely match a call. Assign them. Never auto-attach.
        </p>
        <div className="mt-4">
          <DataTable
            columns={[
              { key: "source", label: "Source" },
              { key: "when", label: "Received" },
              { key: "who", label: "Participants" },
              { key: "action", label: "" },
            ]}
            empty="No unmatched transcripts."
            rows={props.unmatched.map((row) => ({
              source: TRANSCRIPT_SOURCE_LABELS[row.source as keyof typeof TRANSCRIPT_SOURCE_LABELS] ?? row.source,
              when: formatRelative(row.receivedAt, props.now),
              who: row.participantEmails.join(", ") || "—",
              action: (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={selectClass}
                    value={assignCallId[row.id] ?? ""}
                    onChange={(event) =>
                      setAssignCallId((current) => ({ ...current, [row.id]: event.target.value }))
                    }
                  >
                    <option value="">Choose a call</option>
                    {props.assignableCalls.map((call) => (
                      <option key={call.id} value={call.id}>
                        {call.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={`${btnPrimary} ${btnSizeSm}`}
                    disabled={pending || !assignCallId[row.id]}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await assignUnmatchedTranscript({
                          unmatchedId: row.id,
                          callId: assignCallId[row.id],
                        });
                        setTranscriptStatus(result.status === "error" ? result.error : "Transcript assigned.");
                      });
                    }}
                  >
                    Assign
                  </button>
                  <button
                    type="button"
                    className={`${btnSecondary} ${btnSizeSm}`}
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await discardUnmatchedTranscript(row.id);
                        setTranscriptStatus(result.status === "error" ? result.error : "Transcript discarded.");
                      });
                    }}
                  >
                    Discard
                  </button>
                </div>
              ),
            }))}
          />
        </div>
      </Panel>

      <Panel className="px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Manual paste</h2>
        <p className={helperClass}>
          Permanent fallback. Lands in the unmatched queue so an operator attaches it to a call.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await pasteUnmatchedTranscript(pasteText);
              setTranscriptStatus(result.status === "error" ? result.error : "Transcript stored for assignment.");
              if (result.status === "saved") setPasteText("");
            });
          }}
        >
          <textarea
            className={inputClass}
            rows={6}
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            required
          />
          <button type="submit" className={`${btnPrimary} ${btnSizeSm}`} disabled={pending || !pasteText.trim()}>
            Store unmatched
          </button>
        </form>
      </Panel>
    </div>
  );
}
