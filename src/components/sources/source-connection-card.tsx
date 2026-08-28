"use client";

import { useActionState } from "react";

import {
  connectCalendarViaGhl,
  connectCommasKey,
  connectFormPlatform,
  disconnectConnectedSource,
  testConnectedSource,
} from "@/app/portal/source-actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tone } from "@/components/ui/tone";
import type { SourceCardModel } from "@/lib/sources/catalog";
import { formatRelative } from "@/lib/format";
import { cardTitle, errorClass, helperClass } from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

function statusTone(status: SourceCardModel["status"]): Tone {
  if (status === "active") return "good";
  if (status === "broken") return "critical";
  return "neutral";
}

function statusLabel(status: SourceCardModel["status"]): string {
  if (status === "active") return "Connected";
  if (status === "broken") return "Broken";
  if (status === "inactive") return "Disconnected";
  return "Not connected";
}

export function SourceConnectionCard({
  source,
  now,
}: {
  source: SourceCardModel;
  now: string;
}) {
  const [testState, testAction, testing] = useActionState(testConnectedSource, idle);
  const [disconnectState, disconnectAction, disconnecting] = useActionState(
    disconnectConnectedSource,
    idle
  );
  const [commasState, commasAction, commasPending] = useActionState(connectCommasKey, idle);
  const [formState, formAction, formPending] = useActionState(connectFormPlatform, idle);
  const [ghlCalState, ghlCalAction, ghlCalPending] = useActionState(connectCalendarViaGhl, idle);

  const connected = source.status === "active" || source.status === "broken";
  const error =
    (testState.status === "error" ? testState.error : null) ||
    (disconnectState.status === "error" ? disconnectState.error : null) ||
    (commasState.status === "error" ? commasState.error : null) ||
    (formState.status === "error" ? formState.error : null) ||
    (ghlCalState.status === "error" ? ghlCalState.error : null);

  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={cardTitle}>{source.title}</h2>
          <p className={helperClass}>{source.unlocks}</p>
          <p className={helperClass}>{source.scopesLine}</p>
        </div>
        <StatusBadge label={statusLabel(source.status)} tone={statusTone(source.status)} />
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-dim">Account</dt>
          <dd className="text-sm text-white">{source.accountLabel || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-dim">Last verified</dt>
          <dd className="text-sm text-white">
            {source.lastVerifiedAt ? formatRelative(source.lastVerifiedAt, now) : "—"}
          </dd>
        </div>
      </dl>
      {source.lastError ? <p className={`${errorClass} mt-3`}>{source.lastError}</p> : null}

      {source.webhookUrl ? (
        <p className={`${helperClass} mt-3 break-all`}>Webhook URL: {source.webhookUrl}</p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {source.connectMode === "unavailable" ? (
          <p className="text-sm text-silver">{source.unavailableReason}</p>
        ) : null}

        {source.connectMode === "oauth" && !connected ? (
          <Button variant="gradient" size="lg" render={<a href={`/api/sources/oauth/start?kind=${source.kind}`} />}>
            Connect
          </Button>
        ) : null}

        {source.connectMode === "oauth" && connected ? (
          <Button variant="gradient" size="lg" render={<a href={`/api/sources/oauth/start?kind=${source.kind}`} />}>
            Reconnect
          </Button>
        ) : null}

        {source.connectMode === "ghl_reuse" && !connected ? (
          <form action={ghlCalAction}>
            <SubmitButton variant="gradient" pending={ghlCalPending} loadingLabel="Connecting">
              Connect
            </SubmitButton>
          </form>
        ) : null}

        {source.connectMode === "api_key" && !connected ? (
          <form action={commasAction} className="flex w-full flex-col gap-3 sm:max-w-md">
            <Field label="API key" name="api_key" htmlFor={`${source.kind}-key`}>
              <Input
                id={`${source.kind}-key`}
                name="api_key"
                type="password"
                required
                autoComplete="off"
                placeholder="Read-only key"
              />
            </Field>
            <SubmitButton variant="gradient" pending={commasPending} loadingLabel="Connecting">
              Connect
            </SubmitButton>
          </form>
        ) : null}

        {source.connectMode === "webhook" && !connected ? (
          <form action={formAction} className="flex w-full flex-col gap-3 sm:max-w-md">
            <Field
              label="Webhook secret (optional)"
              name="webhook_secret"
              htmlFor={`${source.kind}-secret`}
              help="If set, posts must sign the body with HMAC-SHA256 in x-vistrial-signature."
            >
              <Input
                id={`${source.kind}-secret`}
                name="webhook_secret"
                type="password"
                autoComplete="off"
                placeholder="Leave blank to generate"
              />
            </Field>
            <SubmitButton variant="gradient" pending={formPending} loadingLabel="Connecting">
              Connect
            </SubmitButton>
          </form>
        ) : null}

        {connected ? (
          <>
            <form action={testAction}>
              <input type="hidden" name="kind" value={source.kind} />
              <SubmitButton variant="secondary" pending={testing} loadingLabel="Testing">
                Test
              </SubmitButton>
            </form>
            <form action={disconnectAction}>
              <input type="hidden" name="kind" value={source.kind} />
              <SubmitButton variant="secondary" pending={disconnecting} loadingLabel="Disconnecting">
                Disconnect
              </SubmitButton>
            </form>
          </>
        ) : null}
      </div>
      {error ? <p className={`${errorClass} mt-3`}>{error}</p> : null}
      {testState.status === "saved" ? <p className="mt-3 text-sm text-flag-good">Verified just now.</p> : null}
    </Panel>
  );
}
