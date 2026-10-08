"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addChannelAction,
  saveGateAction,
  saveRouteAction,
  setDestinationActiveAction,
} from "@/app/(workspace)/app/settings/vistrial/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { ChoiceRow } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { Notice } from "@/components/ui/states";
import { toastManager } from "@/components/ui/toast";
import {
  DESTINATION_KIND_COPY,
  EXECUTION_TOOLS,
  EXECUTION_TYPE_COPY,
  GATE_MODES,
  GATE_MODE_COPY,
  MESSAGE_KINDS,
  MESSAGE_KIND_COPY,
  type ExecutionType,
  type GateMode,
} from "@/lib/sales-os/catalog";
import type { SalesOsSettings } from "@/lib/sales-os/settings";
import { captionText, cardTitle, sectionTitle } from "@/lib/ui";

type Managers = Array<{ name: string; role: string }>;

function report(result: { ok: true } | { ok: false; error: string }, saved = "Saved.") {
  toastManager.add(
    result.ok
      ? { title: "Saved", description: saved, type: "success" }
      : { title: "Couldn't save", description: result.error, type: "error" }
  );
}

export function GateChoices({
  settings,
  modes,
  onChange,
}: {
  settings: SalesOsSettings;
  modes: Record<ExecutionType, GateMode>;
  onChange: (type: ExecutionType, mode: GateMode) => void;
}) {
  return (
    <div className="grid gap-4">
      {EXECUTION_TOOLS.map((type) => (
        <Card key={type}>
          <CardPanel className="space-y-3">
            <div>
              <h3 className={cardTitle}>{EXECUTION_TYPE_COPY[type].title}</h3>
              <p className={captionText}>{EXECUTION_TYPE_COPY[type].description}</p>
            </div>
            <RadioGroup
              value={modes[type]}
              onValueChange={(value) => onChange(type, value as GateMode)}
              disabled={!settings.canManage}
              aria-label={EXECUTION_TYPE_COPY[type].title}
            >
              {GATE_MODES.map((mode) => (
                <ChoiceRow
                  key={mode}
                  control={<Radio value={mode} />}
                  label={GATE_MODE_COPY[mode].title}
                  description={GATE_MODE_COPY[mode].description}
                />
              ))}
            </RadioGroup>
          </CardPanel>
        </Card>
      ))}
    </div>
  );
}

export function WhoCanChange({ managers }: { managers: Managers }) {
  return (
    <p className={captionText}>
      Only owners and admins can change these settings
      {managers.length ? `: right now that's ${managers.map((m) => `${m.name} (${m.role})`).join(", ")}` : ""}. Everyone else can read them.
    </p>
  );
}

function DriveCard({ settings, returnTo }: { settings: SalesOsSettings; returnTo: "settings" | "onboarding" }) {
  const drive = settings.destinations.find((d) => d.kind === "google_drive" && d.active);
  return (
    <Card>
      <CardPanel className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cardTitle}>Where assets are stored</h3>
          {drive ? <Badge variant="success">Google Drive connected</Badge> : <Badge variant="outline">Not connected</Badge>}
        </div>
        <p className={captionText}>
          Vistrial saves each script or brief as a new Google Doc in a folder called Vistrial, sorted by type. It can only
          see the files it creates, and it never opens, changes, or removes anything else in your Drive.
        </p>
        {drive?.accountLabel ? <p className="text-sm text-card-foreground">Connected as {drive.accountLabel}.</p> : null}
        {!settings.driveAvailable ? (
          <Notice tone="info">Google Drive can&apos;t be connected on this deployment yet.</Notice>
        ) : settings.canManage ? (
          <Button
            variant={drive ? "outline" : "primary"}
            size="sm"
            render={<a href={`/api/sales-os/drive/start?return=${returnTo}`} />}
          >
            {drive ? "Connect a different Google account" : "Connect Google Drive"}
          </Button>
        ) : null}
      </CardPanel>
    </Card>
  );
}

function ChannelsCard({ settings }: { settings: SalesOsSettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState("slack_channel");
  const [label, setLabel] = useState("");
  const [link, setLink] = useState("");
  const channels = settings.destinations.filter((d) => d.kind !== "google_drive");

  return (
    <Card>
      <CardPanel className="space-y-4">
        <div>
          <h3 className={cardTitle}>Slack and Discord channels</h3>
          <p className={captionText}>
            Each channel gets its own posting link. A posting link can only add messages to that one channel: Vistrial
            can&apos;t read the channel, edit, or remove anything in it. Use team channels only, never one your prospects are in.
          </p>
        </div>
        {channels.length ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {channels.map((channel) => (
              <li key={channel.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="text-sm font-medium text-card-foreground">{channel.label}</span>
                <Badge variant="outline">{DESTINATION_KIND_COPY[channel.kind]}</Badge>
                {!channel.active ? <Badge variant="warning">Not in use</Badge> : null}
                {settings.canManage ? (
                  <Button
                    className="ml-auto"
                    variant="ghost"
                    size="xs"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const result = await setDestinationActiveAction(channel.id, !channel.active);
                        report(result, channel.active ? "Vistrial won't post there any more." : "Vistrial can post there again.");
                        router.refresh();
                      })
                    }
                  >
                    {channel.active ? "Stop using" : "Use again"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No channels yet.</p>
        )}
        {settings.canManage ? (
          <form
            className="grid gap-3 sm:grid-cols-[10rem_1fr]"
            onSubmit={(event) => {
              event.preventDefault();
              start(async () => {
                const result = await addChannelAction({ kind, label, link });
                report(result, "Channel added.");
                if (result.ok) {
                  setLabel("");
                  setLink("");
                  router.refresh();
                }
              });
            }}
          >
            <Select aria-label="Where the channel is" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="slack_channel">Slack</option>
              <option value="discord_channel">Discord</option>
            </Select>
            <Input aria-label="Channel name" placeholder="#sales-wins" value={label} onChange={(e) => setLabel(e.target.value)} />
            <div className="sm:col-span-2 space-y-1.5">
              <Input
                aria-label="Posting link"
                placeholder={kind === "slack_channel" ? "https://hooks.slack.com/services/…" : "https://discord.com/api/webhooks/…"}
                value={link}
                onChange={(e) => setLink(e.target.value)}
                autoComplete="off"
              />
              <p className={captionText}>
                {kind === "slack_channel"
                  ? "In Slack, add the Incoming Webhooks app to the channel and copy the link it gives you."
                  : "In Discord, open the channel's settings, then Integrations, create a new link for posting, and copy it."}{" "}
                The link is stored encrypted and never shown again.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="outline" size="sm" disabled={pending || !label.trim() || !link.trim() || !settings.encryptionReady}>
                Add channel
              </Button>
            </div>
          </form>
        ) : null}
      </CardPanel>
    </Card>
  );
}

function RoutesCard({ settings }: { settings: SalesOsSettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const channels = settings.destinations.filter((d) => d.kind !== "google_drive" && d.active);
  return (
    <Card>
      <CardPanel className="space-y-4">
        <div>
          <h3 className={cardTitle}>Which channel gets what</h3>
          <p className={captionText}>When you ask Vistrial to post, this is where each kind of post goes unless you name a channel.</p>
        </div>
        <div className="grid gap-3">
          {MESSAGE_KINDS.map((kind) => {
            const current = settings.routes.find((route) => route.messageKind === kind)?.destinationId ?? "";
            return (
              <div key={kind} className="grid gap-1.5 sm:grid-cols-[1fr_16rem] sm:items-center">
                <div>
                  <p className="text-sm font-medium text-card-foreground">{MESSAGE_KIND_COPY[kind].title}</p>
                  <p className={captionText}>{MESSAGE_KIND_COPY[kind].description}</p>
                </div>
                <Select
                  aria-label={`Channel for ${MESSAGE_KIND_COPY[kind].title.toLowerCase()}`}
                  value={channels.some((c) => c.id === current) ? current : ""}
                  disabled={!settings.canManage || pending}
                  onChange={(event) =>
                    start(async () => {
                      const result = await saveRouteAction(kind, event.target.value || null);
                      report(result);
                      router.refresh();
                    })
                  }
                >
                  <option value="">Nowhere</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.label} ({channel.kind === "slack_channel" ? "Slack" : "Discord"})
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>
      </CardPanel>
    </Card>
  );
}

export function DestinationSettings({ settings, returnTo }: { settings: SalesOsSettings; returnTo: "settings" | "onboarding" }) {
  return (
    <div className="grid gap-4">
      <DriveCard settings={settings} returnTo={returnTo} />
      <ChannelsCard settings={settings} />
      <RoutesCard settings={settings} />
    </div>
  );
}

/** Settings page: each approval choice saves as soon as it's picked. */
export function SalesOsSettingsForm({ settings, managers }: { settings: SalesOsSettings; managers: Managers }) {
  const [modes, setModes] = useState(settings.gates);
  const [, start] = useTransition();
  return (
    <div className="space-y-8">
      {!settings.canManage ? (
        <Notice tone="info">You can read these settings. An owner or admin can change them.</Notice>
      ) : null}
      {!settings.encryptionReady ? (
        <Notice tone="warning">This deployment can&apos;t store connection links safely yet, so channels can&apos;t be added.</Notice>
      ) : null}
      <section className="space-y-3">
        <h2 className={sectionTitle}>What needs your OK</h2>
        <WhoCanChange managers={managers} />
        <GateChoices
          settings={settings}
          modes={modes}
          onChange={(type, mode) => {
            const previous = modes[type];
            setModes((current) => ({ ...current, [type]: mode }));
            start(async () => {
              const result = await saveGateAction(type, mode);
              report(result, `${EXECUTION_TYPE_COPY[type].title}: ${GATE_MODE_COPY[mode].title.toLowerCase()}.`);
              if (!result.ok) setModes((current) => ({ ...current, [type]: previous }));
            });
          }}
        />
      </section>
      <section className="space-y-3">
        <h2 className={sectionTitle}>Where things go</h2>
        <DestinationSettings settings={settings} returnTo="settings" />
      </section>
    </div>
  );
}
