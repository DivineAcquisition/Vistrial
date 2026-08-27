"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { markMobileTraining } from "@/app/app/log/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/states";
import { Panel } from "@/components/ui/panel";
import { RemainingCount } from "@/components/ui/remaining-count";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { StatusBadge } from "@/components/ui/status-badge";
import { useOrg } from "@/components/app/org-provider";
import { describeOutcomeDiscrepancy } from "@/lib/mobile/discrepancy";
import { flushQueuedOutcomes } from "@/lib/mobile/flush-outcomes";
import {
  enqueueOutcome,
  newClientEventId,
  openIndexedDbOutcomeStore,
  unsyncedOutcomes,
  type QueuedOutcome,
} from "@/lib/mobile/outcome-queue";
import { detectClientSurface } from "@/lib/mobile/surface";
import type { LogContext } from "@/lib/mobile/log-context";
import {
  TOUCH_CHANNEL_LABELS,
  TOUCH_CHANNELS,
  TOUCH_DIRECTIONS,
  TOUCH_OUTCOME_LABELS,
  TOUCH_OUTCOMES,
  type QueueRow,
  type TouchChannel,
  type TouchDirection,
  type TouchOutcome,
} from "@/lib/queue/types";
import {
  errorClass,
  helperClass,
  labelClass,
} from "@/lib/ui";

function defaultChannel(from: string | null): TouchChannel {
  if (from === "sms") return "sms";
  if (from === "email") return "email";
  return "call";
}

function defaultDirection(from: string | null): TouchDirection {
  return from === "inbound" ? "inbound" : "outbound";
}

type VoiceRecognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: VoiceRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

type VoiceRecognitionEvent = {
  results: ArrayLike<ArrayLike<{ transcript?: string }>>;
};

export function LogOutcomeScreen({
  initial,
  from,
  walkthrough,
}: {
  initial: LogContext;
  from: string | null;
  walkthrough: boolean;
}) {
  const org = useOrg();
  const router = useRouter();
  const [selected, setSelected] = useState<QueueRow | null>(initial.selected);
  const [channel, setChannel] = useState<TouchChannel>(defaultChannel(from));
  const [direction, setDirection] = useState<TouchDirection>(defaultDirection(from));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [discrepancy, setDiscrepancy] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [queued, setQueued] = useState<QueuedOutcome[]>([]);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const voiceSupported =
    typeof window !== "undefined" &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );

  async function loadQueued() {
    const store = await openIndexedDbOutcomeStore();
    setQueued(unsyncedOutcomes(await store.getAll()));
  }

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    void loadQueued();
    window.addEventListener("vistrial-outcome-sync", loadQueued);
    return () => window.removeEventListener("vistrial-outcome-sync", loadQueued);
  }, []);

  useEffect(() => {
    if (detectClientSurface() !== "mobile") return;
    void markMobileTraining("session");
  }, []);

  useEffect(() => {
    if (initial.reason === "call" || initial.reason === "lead") return;
    const last = window.localStorage.getItem(`vistrial:last-opened-lead:${org.org.id}`);
    if (!last) return;
    const match = initial.candidates.find((row) => row.id === last);
    if (match) setSelected(match);
  }, [initial.candidates, initial.reason, org.org.id]);

  const reasonLabel = useMemo(() => {
    if (initial.reason === "call") return "From the call that just ended.";
    if (from === "notification") return "From the notification you opened.";
    if (from === "recent") return "The last lead you opened.";
    if (initial.reason === "queue") return "Next in the queue.";
    return null;
  }, [from, initial.reason]);

  async function registerBackgroundSync() {
    if (!("serviceWorker" in navigator) || !("SyncManager" in window)) return;
    const registration = await navigator.serviceWorker.ready;
    const sync = (
      registration as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      }
    ).sync;
    await sync?.register("outcome-sync").catch(() => undefined);
  }

  async function chooseOutcome(outcome: TouchOutcome) {
    if (!selected) {
      setError("Pick a lead first.");
      return;
    }
    setBusy(true);
    setError(null);
    setPendingNotice(null);
    setDiscrepancy(null);
    const surface = detectClientSurface();
    const onlineNow = navigator.onLine;
    const draft: Omit<QueuedOutcome, "status" | "lastError" | "discrepancy" | "createdAt" | "syncedAt"> = {
      clientEventId: newClientEventId(),
      leadId: selected.id,
      leadName: selected.name,
      orgId: org.org.id,
      channel,
      direction,
      outcome,
      note,
      actorMemberId: org.memberId,
      clientLoggedAt: new Date().toISOString(),
      queuedOffline: !onlineNow,
      clientSurface: surface,
      expectedLeadStatus: selected.status,
      expectedLastTouchAt: selected.lastTouchAt,
      expectedFirstHumanTouchAt: selected.firstHumanTouchAt,
    };

    try {
      const store = await openIndexedDbOutcomeStore();
      await enqueueOutcome(store, draft);
      await registerBackgroundSync();
      const result = await flushQueuedOutcomes();
      const row =
        result.synced.find((item) => item.clientEventId === draft.clientEventId) ??
        result.pending.find((item) => item.clientEventId === draft.clientEventId) ??
        result.failed.find((item) => item.clientEventId === draft.clientEventId);

      if (row?.status === "failed") {
        setError(row.lastError || "Could not log that outcome.");
        await loadQueued();
        return;
      }
      if (row?.status === "pending") {
        setPendingNotice("Queued on this phone. It will sync when there is signal. It is not logged yet.");
      } else if (row?.discrepancy) {
        setDiscrepancy(row.discrepancy);
      } else {
        const expected = describeOutcomeDiscrepancy(
          {
            status: selected.status,
            lastTouchAt: selected.lastTouchAt,
            firstHumanTouchAt: selected.firstHumanTouchAt,
          },
          {
            status: selected.status,
            lastTouchAt: selected.lastTouchAt,
            firstHumanTouchAt: selected.firstHumanTouchAt,
          }
        );
        if (expected) setDiscrepancy(expected);
      }
      if (walkthrough && surface === "mobile") {
        void markMobileTraining("walkthrough");
      }
      try {
        window.localStorage.setItem("vistrial:push-prompt-eligible", "1");
      } catch {
        // Ignore quota.
      }
      window.setTimeout(() => {
        router.replace("/app/queue");
        router.refresh();
      }, row?.status === "pending" || row?.discrepancy ? 1400 : 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log that outcome.");
    } finally {
      setBusy(false);
      await loadQueued();
    }
  }

  function startVoice() {
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => VoiceRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => VoiceRecognition })
        .webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event: VoiceRecognitionEvent) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) setNote((current) => (current ? `${current} ${text}` : text).slice(0, 280));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  return (
    <div className="space-y-5 pb-8">
      {!online ? (
        <Notice tone="warning" title="No signal">
          You can still log an outcome. It stays pending on this phone until it syncs. It will not
          show as logged until the server has it.
        </Notice>
      ) : null}
      {walkthrough ? (
        <Notice tone="info" title="One time, from this phone">
          Tap the result of the contact. Typing is optional. Training is not complete until this
          lands from a phone.
        </Notice>
      ) : null}
      {pendingNotice ? <Notice tone="warning" title="Pending">{pendingNotice}</Notice> : null}
      {discrepancy ? <Notice tone="warning" title="Still recorded">{discrepancy}</Notice> : null}

      {queued.length > 0 ? (
        <Panel className="space-y-3 p-5">
          <p className={labelClass}>On this phone</p>
          <ul className="space-y-2">
            {queued.map((row) => (
              <li key={row.clientEventId} className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words text-sm text-silver">
                  {row.leadName} · {TOUCH_OUTCOME_LABELS[row.outcome]} ·{" "}
                  {row.status === "failed" ? row.lastError || "failed" : "pending"}
                </p>
                <StatusBadge
                  label={row.status === "failed" ? "Failed" : "Pending"}
                  tone={row.status === "failed" ? "critical" : "warning"}
                />
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            size="xl"
            disabled={busy || !online}
            onClick={() => {
              setBusy(true);
              void flushQueuedOutcomes()
                .then(loadQueued)
                .finally(() => setBusy(false));
            }}
          >
            Retry queued outcomes
          </Button>
        </Panel>
      ) : null}

      <Panel className="p-5">
        <p className={labelClass}>Lead</p>
        {selected ? (
          <>
            <p className="mt-1 font-heading text-xl text-white">{selected.name}</p>
            {reasonLabel ? <p className={helperClass}>{reasonLabel}</p> : null}
            {selected.score !== null ? (
              <p className="mt-2 text-sm text-silver">
                Score {selected.score}
                {selected.leadType === "ready_track"
                  ? " · Ready"
                  : selected.leadType === "nurture_track"
                    ? " · Nurture"
                    : ""}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm text-dim">Nobody is inferred. Pick who you just contacted.</p>
        )}
        {initial.candidates.length > 1 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {initial.candidates.slice(0, 8).map((row) => (
              <Button
                key={row.id}
                type="button"
                variant={row.id === selected?.id ? "primary" : "secondary"}
                size="sm"
                onClick={() => setSelected(row)}
              >
                {row.name}
              </Button>
            ))}
          </div>
        ) : null}
      </Panel>

      <div>
        <p className={labelClass}>Channel</p>
        <div className="mt-2">
          <SegmentedRadioGroup
            aria-label="Channel"
            className="w-full max-w-xl"
            onValueChange={(next) => setChannel(next as TouchChannel)}
            options={TOUCH_CHANNELS.map((value) => ({
              value,
              label: TOUCH_CHANNEL_LABELS[value],
            }))}
            size="lg"
            value={channel}
          />
        </div>
      </div>

      <div>
        <p className={labelClass}>Direction</p>
        <div className="mt-2">
          <SegmentedRadioGroup
            aria-label="Direction"
            onValueChange={(next) => setDirection(next as TouchDirection)}
            options={TOUCH_DIRECTIONS.map((value) => ({
              value,
              label: value === "outbound" ? "Outbound" : "Inbound",
            }))}
            size="lg"
            value={direction}
          />
        </div>
      </div>

      <div>
        <p className={labelClass}>Note (optional)</p>
        <div className="mt-2 flex gap-2">
          <Input
            type="text"
            className="flex-1"
            maxLength={280}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Skip this. Never required."
          />
          {voiceSupported ? (
            <Button
              type="button"
              variant="secondary"
              size="xl"
              onClick={startVoice}
              aria-pressed={listening}
            >
              {listening ? "Listening…" : "Speak"}
            </Button>
          ) : null}
        </div>
        <RemainingCount max={280} value={note} />
      </div>

      <div>
        <p className={labelClass}>Outcome</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {TOUCH_OUTCOMES.map((outcome) => (
            <Button
              key={outcome}
              type="button"
              variant="primary"
              size="xl"
              className="min-h-11"
              disabled={busy || !selected}
              onClick={() => void chooseOutcome(outcome)}
            >
              {TOUCH_OUTCOME_LABELS[outcome]}
            </Button>
          ))}
        </div>
      </div>

      {busy ? <StatusBadge label="Pending" tone="warning" /> : null}
      {error ? <p className={errorClass}>{error}</p> : null}
      <Button type="button" variant="ghost" size="sm" onClick={() => router.replace("/app/queue")}>
        Back to the queue
      </Button>
    </div>
  );
}
