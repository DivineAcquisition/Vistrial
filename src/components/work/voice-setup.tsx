"use client";

import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";

import { CheckCircle2, Mic, Square, Trash2 } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showError } from "@/lib/errors/show-error";
import type { api } from "../../../convex/_generated/api";
import { consentStatement } from "../../../convex/lib/dealmaker/voice";

export type VoiceStatus = FunctionReturnType<typeof api.voiceNotes.status>;
type Recording = { blob: Blob; seconds: number };

export type VoiceActions = {
  /** Uploads the recording and asks the server to keep it. Returns the refusal's reason, or null when kept. */
  record: (input: { speakerName: string; typedName: string; recording: Recording }) => Promise<string | null>;
  retry: () => Promise<unknown>;
  remove: () => Promise<unknown>;
};

/** A recording made in the browser, between the minimum and maximum the clone needs. */
function Recorder({ min, max, value, onChange }: { min: number; max: number; value: Recording | null; onChange: (value: Recording | null) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stop();
    setRecording(false);
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream);
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const length = Math.min(max, Math.max(1, Math.round((Date.now() - started.current) / 1000)));
        onChange({ blob: new Blob(chunks, { type: media.mimeType || "audio/webm" }), seconds: length });
      };
      recorder.current = media;
      started.current = Date.now();
      setSeconds(0);
      media.start();
      setRecording(true);
      timer.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - started.current) / 1000);
        setSeconds(elapsed);
        if (elapsed >= max) stop();
      }, 250);
    } catch {
      showError(new Error("The microphone could not be opened."));
    }
  };

  if (recording) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={stop}>
          <Square aria-hidden className="size-3.5" />
          Stop
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums" role="status">
          {seconds}s recorded{seconds < min ? `, at least ${min - seconds}s more` : ""}
        </span>
      </div>
    );
  }
  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={value.seconds >= min ? "success" : "warning"} size="sm">
          <CheckCircle2 aria-hidden className="size-3" />
          Recorded, {value.seconds}s
        </Badge>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
          <Trash2 aria-hidden className="size-3.5" />
          Record again
        </Button>
      </div>
    );
  }
  return (
    <div>
      <Button size="sm" variant="outline" onClick={() => void start()}>
        <Mic aria-hidden className="size-3.5" />
        Start recording
      </Button>
    </div>
  );
}

function statement(speakerName: string, business: string) {
  return consentStatement(speakerName.trim() || "[your name]", business);
}

/** The cloned voice for voice notes: its state for everyone, and the consent recording for an Owner. */
export function VoiceSetup({ status, actions }: { status: VoiceStatus; actions: VoiceActions }) {
  const [speakerName, setSpeakerName] = useState("");
  const [typedName, setTypedName] = useState("");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const rules = (
    <p className="text-xs text-muted-foreground">
      A voice note goes only as an audio attachment to a text or email, never as a voicemail; only to leads under your consent tags; and only after a person listens to it and approves it with SEND.
    </p>
  );

  if (!status.setUp) {
    return (
      <div className="grid gap-2" data-voice-setup="not-set-up">
        <p className="text-sm text-foreground">Voice notes are not set up yet.</p>
        {rules}
      </div>
    );
  }

  if (status.voice) {
    const voice = status.voice;
    return (
      <div className="grid gap-2" data-voice-setup={voice.status}>
        <p className="text-sm text-foreground">
          {voice.speakerName}&apos;s voice. {voice.words}
        </p>
        {rules}
        {status.canRecord ? (
          <div className="flex flex-wrap gap-2">
            {voice.status === "failed" || voice.status === "notSetUp" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await actions.retry();
                  } catch (error) {
                    showError(error);
                  }
                  setBusy(false);
                }}
              >
                Try again
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await actions.remove();
                } catch (error) {
                  showError(error);
                }
                setBusy(false);
              }}
            >
              <Trash2 aria-hidden className="size-3.5" />
              Delete this voice
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (!status.canRecord) {
    return (
      <div className="grid gap-2" data-voice-setup="none">
        <p className="text-sm text-foreground">No voice is recorded yet. An Owner records it here, with the speaker&apos;s consent in their own voice.</p>
        {rules}
      </div>
    );
  }

  const longEnough = recording !== null && recording.seconds >= status.limits.sampleSecondsMin;
  return (
    <div className="grid gap-3" data-voice-setup="record">
      {rules}
      <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="voice-speaker">
        Whose voice is this?
        <Input id="voice-speaker" value={speakerName} maxLength={80} onChange={(event) => setSpeakerName(event.target.value)} placeholder="Their full name" />
      </label>
      <div className="grid gap-1">
        <p className="text-xs text-muted-foreground">
          They read this aloud, word for word, then the passage below. Between {status.limits.sampleSecondsMin} seconds and {Math.round(status.limits.sampleSecondsMax / 60)} minutes in all.
        </p>
        <blockquote className="border-l-2 border-primary/50 pl-3 text-sm text-foreground">{statement(speakerName, status.business)}</blockquote>
        <blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground">{status.passage}</blockquote>
      </div>
      <Recorder min={status.limits.sampleSecondsMin} max={status.limits.sampleSecondsMax} value={recording} onChange={setRecording} />
      <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="voice-confirm">
        To confirm the recording is theirs and they agreed, type their name again
        <Input id="voice-confirm" value={typedName} maxLength={80} onChange={(event) => setTypedName(event.target.value)} />
      </label>
      {problem ? (
        <p className="text-xs text-destructive" role="alert">
          {problem}
        </p>
      ) : null}
      <div>
        <Button
          size="sm"
          disabled={busy || !speakerName.trim() || !typedName.trim() || !longEnough}
          onClick={async () => {
            if (!recording) return;
            setBusy(true);
            setProblem(null);
            try {
              const refused = await actions.record({ speakerName, typedName, recording });
              if (refused) setProblem(refused);
              if (refused) setRecording(null);
            } catch (error) {
              showError(error);
            }
            setBusy(false);
          }}
        >
          Save the voice
        </Button>
      </div>
    </div>
  );
}
