"use client";

import { useActionState, useState, useTransition } from "react";

import {
  retryWebhookEvent,
  saveGhlFieldMaps,
  saveTranscriptConnection,
  rotateTranscriptWebhookToken,
  pasteUnmatchedTranscript,
  assignUnmatchedTranscript,
  discardUnmatchedTranscript,
  testCrmConnection,
  type FieldMapPayload,
} from "@/app/app/settings/integrations/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/ui/data-table";
import { Select } from "@/components/ui/select";
import { Panel } from "@/components/ui/panel";
import { Notice } from "@/components/ui/states";
import { formatRelative } from "@/lib/format";
import { RECORDER_SOURCES } from "@/lib/transcripts/constants";
import { TRANSCRIPT_SOURCE_LABELS } from "@/lib/leads/labels";
import {
  cardTitle,
  errorClass,
  helperClass,
  labelClass,
} from "@/lib/ui";

export type IntegrationFieldMap = FieldMapPayload & { id: string };
export type CustomFieldOption = { id: string; name: string; key?: string };
export type DeadEvent = {
  id: string;
  eventType: string;
  errorText: string | null;
  receivedAt: string;
};

export type IntegrationSettingsProps = {
  connection: {
    status: "active" | "broken" | "inactive" | "missing";
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
  followUpHealth: {
    deadJobs: number;
    stalePendingJobs: number;
    enqueueFailed: number;
    enqueueNoRoute: number;
    qualityFailures: Array<{ type: string; count: number }>;
    warning: boolean;
  };
};

const initial: SettingsSaveResult = { status: "idle" };

export function IntegrationSettings(props: IntegrationSettingsProps) {
  const [testState, testAction, testing] = useActionState(testCrmConnection, initial);
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
        <Notice tone="critical" title="The CRM connection is broken">
          Token refresh failed. Outbound dispatch is halted until an owner or admin reconnects.
            Inbound events still store if the location is linked. This is an emergency for this
            product — reconnect now.
        </Notice>
      ) : null}

      {props.connection.lastSetupError ? (
        <Notice tone="warning" title="Webhook registration did not finish">
          The location is linked, but LeadConnector did not accept the webhook subscription. Inbound
            events will not arrive until this is fixed. Reconnect, or check the marketplace app
            webhook URL. Recorded cause: {props.connection.lastSetupError}.
        </Notice>
      ) : null}

      {props.connection.status === "active" && props.maps.length === 0 ? (
        <Notice tone="warning" title="No application field maps">
          Contacts can ingest, but intake scores will stay empty until LeadConnector custom fields are
            mapped onto answer keys. A blank score is not a successful scoring setup.
        </Notice>
      ) : null}

      {props.health.stale ? (
        <Notice tone="warning" title="Ingestion looks stalled">
          {props.health.staleReason ??
              "No event has been processed recently. Leads will not appear until this is fixed."}
        </Notice>
      ) : null}

      {props.transcriptHealth.unmatchedCount > 0 ? (
        <Notice tone="warning" title="Unmatched transcripts need an operator">
          {props.transcriptHealth.unmatchedCount} recording
            {props.transcriptHealth.unmatchedCount === 1 ? "" : "s"} could not be attached to a call.
            Assign them below. Vistrial will not guess.
            {props.transcriptHealth.unmatchedOldestAgeMs !== null
              ? ` Oldest is ${Math.round(props.transcriptHealth.unmatchedOldestAgeMs / 60000)}m old.`
              : ""}
        </Notice>
      ) : null}

      {props.followUpHealth.warning ? (
        <Notice tone="warning" title="Follow-up drafting needs attention">
          {props.followUpHealth.deadJobs} dead job
            {props.followUpHealth.deadJobs === 1 ? "" : "s"}, {props.followUpHealth.enqueueFailed} enqueue
            failure
            {props.followUpHealth.enqueueFailed === 1 ? "" : "s"}, and{" "}
            {props.followUpHealth.stalePendingJobs} job
            {props.followUpHealth.stalePendingJobs === 1 ? "" : "s"} waiting more than 15 minutes.
            Drafts will not appear until this is fixed.
        </Notice>
      ) : null}

      <Panel className="p-6">
        <h2 className={cardTitle}>Connection check</h2>
        <p className={helperClass}>
          Ask the CRM for a live answer now. Connecting and disconnecting live on the hub.
        </p>
        <form action={testAction} className="mt-5">
          <SubmitButton variant="secondary" pending={testing} loadingLabel="Testing">
            Test connection
          </SubmitButton>
        </form>
        {testState.status === "error" ? <p className={`${errorClass} mt-3`}>{testState.error}</p> : null}
        {testState.status === "saved" ? <p className="mt-3 text-sm text-flag-good">Verified just now.</p> : null}
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Ingestion health</h2>
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
          <div>
            <dt className={labelClass}>Failed follow-up jobs</dt>
            <dd className="text-sm text-white">{props.followUpHealth.deadJobs}</dd>
          </div>
          <div>
            <dt className={labelClass}>Enqueue failures</dt>
            <dd className="text-sm text-white">{props.followUpHealth.enqueueFailed}</dd>
            <p className={helperClass}>
              Last 7 days
              {props.followUpHealth.enqueueNoRoute > 0
                ? ` · ${props.followUpHealth.enqueueNoRoute} cancelled-call no-route`
                : ""}
            </p>
          </div>
          <div>
            <dt className={labelClass}>Stale follow-up jobs</dt>
            <dd className="text-sm text-white">{props.followUpHealth.stalePendingJobs}</dd>
            <p className={helperClass}>Pending longer than 15 minutes</p>
          </div>
        </dl>

        {props.followUpHealth.qualityFailures.length > 0 ? (
          <div className="mt-6">
            <p className={labelClass}>Quality check failures (7 days)</p>
            <DataTable
              columns={[
                { key: "type", label: "Type" },
                { key: "count", label: "Count", align: "right" },
              ]}
              rows={props.followUpHealth.qualityFailures.map((row) => ({
                type: row.type,
                count: row.count,
              }))}
            />
          </div>
        ) : null}

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

      <Panel className="p-6">
        <h2 className={cardTitle}>Permanently failed events</h2>
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
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await retryWebhookEvent(event.id);
                      setRetryStatus(result.status === "error" ? result.error : "Retry queued.");
                    });
                  }}
                >
                  Retry
                </Button>
              ),
            }))}
          />
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Application field mapping</h2>
        <p className={helperClass}>
          Map this location&apos;s LeadConnector custom fields onto the application answer keys the scoring
          engine already reads. This is data, not code — every client&apos;s LeadConnector is different.
        </p>
        <div className="mt-5 space-y-4">
          {maps.map((map, index) => (
            <div key={map.id} className="grid gap-3 sm:grid-cols-3">
              {props.customFields.length > 0 ? (
                <div>
                  <label className={labelClass}>LeadConnector field</label>
                  <Select
                    
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
                  </Select>
                </div>
              ) : (
                <div>
                  <Field label="LeadConnector field id" name={`ghl-field-id-${map.id}`}>
                    <Input
                      id={`ghl-field-id-${map.id}`}
                      type="text"
                      value={map.ghlFieldId}
                      onChange={(event) =>
                        setMaps((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, ghlFieldId: event.target.value } : row
                          )
                        )
                      }
                      placeholder="abc123"
                    />
                  </Field>
                </div>
              )}
              <div>
                <Field label="LeadConnector field key" name={`ghl-field-key-${map.id}`}>
                  <Input
                    id={`ghl-field-key-${map.id}`}
                    type="text"
                    value={map.ghlFieldKey}
                      onChange={(event) =>
                        setMaps((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, ghlFieldKey: event.target.value } : row
                          )
                        )
                      }
                      placeholder="contact.timeline"
                  />
                </Field>
              </div>
              <div>
                <Field label="Answer key" name={`answer-key-${map.id}`}>
                  <div className="flex gap-2">
                    <Input
                      id={`answer-key-${map.id}`}
                      type="text"
                      value={map.answerKey}
                      onChange={(event) =>
                        setMaps((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, answerKey: event.target.value } : row
                          )
                        )
                      }
                      placeholder="timeline"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setMaps((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                </Field>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setMaps((current) => [
                  ...current,
                  { id: crypto.randomUUID(), ghlFieldId: "", ghlFieldKey: "", answerKey: "" },
                ])
              }
            >
              Add mapping
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await saveGhlFieldMaps(maps);
                  setMapStatus(result);
                });
              }}
            >
              Save mapping
            </Button>
          </div>
          {mapStatus.status === "error" ? <p className={errorClass}>{mapStatus.error}</p> : null}
          {mapStatus.status === "saved" ? (
            <p className="text-sm text-flag-good">Field mapping saved.</p>
          ) : null}
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Call recorders</h2>
        <p className={helperClass}>
          Webhooks for Fathom, Fireflies, Zoom, and LeadConnector. Optional API key for scheduled pull.
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
                  <Field label="Webhook secret" name={`webhook_secret_${source}`}>
                    <Input
                      id={`webhook_secret_${source}`}
                      name="webhook_secret"
                      type="password"
                      placeholder={connection?.hasWebhookSecret ? "Unchanged" : "Paste webhook secret"}
                    />
                  </Field>
                  <Field label="API key for pull" name={`api_key_${source}`}>
                    <Input
                      id={`api_key_${source}`}
                      name="api_key"
                      type="password"
                      placeholder={connection?.hasApiKey ? "Unchanged" : "Paste API key"}
                    />
                  </Field>
                </div>
                {connection?.lastPullError ? (
                  <p className={errorClass}>Last pull: {connection.lastPullError}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="primary" size="sm" disabled={pending}>
                    Save
                  </Button>
                  {connection ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
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
                    </Button>
                  ) : null}
                </div>
              </form>
            );
          })}
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Unmatched transcripts</h2>
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
                  <Select
                    
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
                  </Select>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
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
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await discardUnmatchedTranscript(row.id);
                        setTranscriptStatus(result.status === "error" ? result.error : "Transcript discarded.");
                      });
                    }}
                  >
                    Discard
                  </Button>
                </div>
              ),
            }))}
          />
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Manual paste</h2>
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
          <Textarea
            rows={6}
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            required
            placeholder="Paste the full transcript. Leave speaker labels if you have them."
          />
          <Button type="submit" variant="primary" size="sm" disabled={pending || !pasteText.trim()}>
            Store unmatched
          </Button>
        </form>
      </Panel>
    </div>
  );
}
