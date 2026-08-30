"use client";

import { useActionState, useState } from "react";

import {
  connectCalendarViaGhl,
  connectCommasKey,
  connectFormPlatform,
  disconnectConnectedSource,
} from "@/app/portal/source-actions";
import { disconnectCrm } from "@/app/app/settings/integrations/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Button, SubmitButton } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tone } from "@/components/ui/tone";
import { formatRelative } from "@/lib/format";
import type { HubCard, HubStatus } from "@/lib/integrations/hub";
import { cardTitle, errorClass, helperClass } from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

const TONE: Record<HubStatus, Tone> = {
  connected: "good",
  attention: "critical",
  available: "neutral",
  unavailable: "neutral",
};

function ConnectAction({ card }: { card: HubCard }) {
  const [reuseState, reuseAction, reusePending] = useActionState(connectCalendarViaGhl, idle);
  const [keyState, keyAction, keyPending] = useActionState(connectCommasKey, idle);
  const [webhookState, webhookAction, webhookPending] = useActionState(connectFormPlatform, idle);
  const [showSecret, setShowSecret] = useState(false);

  const connected = card.status === "connected" || card.status === "attention";
  const label = connected ? "Reconnect" : "Connect";
  const error =
    (reuseState.status === "error" ? reuseState.error : null) ||
    (keyState.status === "error" ? keyState.error : null) ||
    (webhookState.status === "error" ? webhookState.error : null);

  if (card.connect.mode === "unavailable") {
    return <p className="text-sm text-silver">{card.note ?? "Not available on this deployment."}</p>;
  }

  if (card.connect.mode === "redirect") {
    return (
      <Button variant={connected ? "secondary" : "gradient"} render={<a href={card.connect.href} />}>
        {label}
      </Button>
    );
  }

  if (card.connect.mode === "reuse") {
    return (
      <div className="w-full">
        <form action={reuseAction}>
          <SubmitButton
            variant={connected ? "secondary" : "gradient"}
            pending={reusePending}
            loadingLabel="Connecting"
          >
            {label}
          </SubmitButton>
        </form>
        {error ? <p className={`${errorClass} mt-2`}>{error}</p> : null}
      </div>
    );
  }

  // Forms need an address in their product, not a secret in ours. We make the
  // secret; they copy the address once and we check it arrived.
  if (card.connect.mode === "webhook") {
    return (
      <div className="w-full space-y-3">
        {card.webhookUrl ? (
          <>
            <CopyField label="Paste this into your form tool" value={card.webhookUrl} />
            <p className={helperClass}>
              Add it wherever that tool sends new submissions, then send yourself a test entry.
            </p>
          </>
        ) : null}
        <form action={webhookAction}>
          <SubmitButton
            variant={connected ? "secondary" : "gradient"}
            pending={webhookPending}
            loadingLabel="Setting up"
          >
            {card.webhookUrl ? "Start over" : label}
          </SubmitButton>
        </form>
        {error ? <p className={errorClass}>{error}</p> : null}
      </div>
    );
  }

  if (!showSecret) {
    return (
      <div className="w-full">
        <Button variant={connected ? "secondary" : "gradient"} onClick={() => setShowSecret(true)}>
          {label}
        </Button>
        <p className={`${helperClass} mt-2`}>
          This one has no one-click sign-in. It needs a read-only key from your account.
        </p>
      </div>
    );
  }

  return (
    <form action={keyAction} className="w-full space-y-3">
      <Field label="Read-only key" name="api_key" htmlFor={`${card.id}-key`}>
        <Input
          id={`${card.id}-key`}
          name="api_key"
          type="password"
          required
          autoComplete="off"
          placeholder="Paste it once"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="gradient" pending={keyPending} loadingLabel="Connecting">
          {label}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setShowSecret(false)}>
          Cancel
        </Button>
      </div>
      {error ? <p className={errorClass}>{error}</p> : null}
    </form>
  );
}

function DisconnectAction({ card }: { card: HubCard }) {
  const [sourceState, sourceAction, sourcePending] = useActionState(disconnectConnectedSource, idle);
  const [crmState, crmAction, crmPending] = useActionState(disconnectCrm, idle);
  const error =
    (sourceState.status === "error" ? sourceState.error : null) ||
    (crmState.status === "error" ? crmState.error : null);

  return (
    <div>
      <form action={card.kind ? sourceAction : crmAction}>
        {card.kind ? <input type="hidden" name="kind" value={card.kind} /> : null}
        <SubmitButton
          variant="ghost"
          size="sm"
          pending={card.kind ? sourcePending : crmPending}
          loadingLabel="Disconnecting"
        >
          Disconnect
        </SubmitButton>
      </form>
      {error ? <p className={`${errorClass} mt-2`}>{error}</p> : null}
    </div>
  );
}

function HubTile({ card, now }: { card: HubCard; now: string }) {
  const connected = card.status === "connected" || card.status === "attention";

  return (
    <Panel className="flex h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={cardTitle}>{card.title}</h3>
          {card.required ? (
            <p className="mt-1 text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">
              Required
            </p>
          ) : null}
        </div>
        <StatusBadge label={card.statusLabel} tone={TONE[card.status]} />
      </div>

      <p className={`${helperClass} mt-3 flex-none`}>{card.summary}</p>

      {connected && (card.accountLabel || card.lastVerifiedAt) ? (
        <p className={`${helperClass} mt-3 min-h-5`}>
          {[
            card.accountLabel,
            card.lastVerifiedAt ? `checked ${formatRelative(card.lastVerifiedAt, now)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      {card.status === "attention" && card.note ? (
        <p className={`${errorClass} mt-3`}>{card.note}</p>
      ) : null}

      <div className="mt-6 flex flex-1 flex-wrap items-end gap-3">
        <ConnectAction card={card} />
        {connected ? <DisconnectAction card={card} /> : null}
      </div>
    </Panel>
  );
}

export function IntegrationHub({
  cards,
  now,
  flash,
  flashError,
}: {
  cards: HubCard[];
  now: string;
  flash: string | null;
  flashError: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      {flashError ? <p className={errorClass}>{flashError}</p> : null}
      {flash ? <p className="app-scale text-sm text-flag-good">{flash}</p> : null}
      <div className="app-stagger grid items-stretch gap-6 sm:grid-cols-2">
        {cards.map((card) => (
          <HubTile key={card.id} card={card} now={now} />
        ))}
      </div>
    </div>
  );
}
