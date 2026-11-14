"use client";

import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { Check, MessageSquareWarning } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";
import type { api } from "../../../convex/_generated/api";
import type { Channel } from "../../../convex/lib/interview";
import type { Stage } from "../../../convex/lib/playbook";

import { SectionTitle } from "./work-shell";

export type InterviewData = FunctionReturnType<typeof api.playbookInterview.view>;

export type InterviewActions = {
  stages: (meanings: { stageRef: string; meaning: string }[]) => Promise<unknown>;
  quietDays: (days: number) => Promise<unknown>;
  script: (steps: { stage: Stage; text: string }[]) => Promise<unknown>;
  pkg: (input: { name: string; includes: string; price: string }) => Promise<unknown>;
  proof: (lines: string[]) => Promise<unknown>;
  voice: (input: { voice: string; signOff: string }) => Promise<unknown>;
  consent: (input: { tags: string[]; channels: Channel[] }) => Promise<unknown>;
  skip: (question: string) => Promise<unknown>;
};

async function run(action: () => Promise<unknown>) {
  try {
    await action();
    return true;
  } catch (error) {
    showError(error);
    return false;
  }
}

/** One open question, with the answer fields it needs. `onSave` returns whether it saved. */
function QuestionForm({ data, id, actions, onDone }: { data: InterviewData; id: string; actions: InterviewActions; onDone: () => void }) {
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [days, setDays] = useState(String(data.quietDays.value ?? data.quietDays.suggested));
  const [channels, setChannels] = useState<Channel[]>(data.channels.filter((row) => row.on).map((row) => row.id));
  const [saving, setSaving] = useState(false);
  const text = (key: string) => texts[key] ?? "";
  const set = (key: string) => (value: string) => setTexts((now) => ({ ...now, [key]: value }));
  const lines = (key: string) => text(key).split("\n").map((row) => row.trim()).filter(Boolean);

  const save = async () => {
    setSaving(true);
    const ok = await run(() => {
      switch (id) {
        case "stages":
          return actions.stages(data.stages.map((row) => ({ stageRef: row.ref, meaning: text(row.ref) || row.meaning })).filter((row) => row.meaning));
        case "quietDays":
          return actions.quietDays(Number(days));
        case "script":
          return actions.script(data.scriptStages.map((row) => ({ stage: row.id as Stage, text: text(row.id) })));
        case "packages":
          return actions.pkg({ name: text("name"), includes: text("includes"), price: text("price") });
        case "proof":
          return actions.proof(lines("proof"));
        case "voice":
          return actions.voice({ voice: text("voice"), signOff: text("signOff") });
        default:
          return actions.consent({ tags: text("tags").split(/[,\n]/).map((row) => row.trim()).filter(Boolean), channels });
      }
    });
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <div className="grid gap-3">
      {id === "stages"
        ? data.stages.map((row) => (
            <label key={row.ref} className="grid gap-1 text-sm">
              <span className="font-medium text-foreground">{row.name}</span>
              <Input aria-label={`What ${row.name} means`} placeholder="What has happened when a deal is here" defaultValue={row.meaning} maxLength={300} onChange={(event) => set(row.ref)(event.target.value)} />
            </label>
          ))
        : null}
      {id === "quietDays" ? (
        <SegmentedRadioGroup aria-label="Days before a deal is quiet" value={days} onValueChange={setDays} options={data.quietDays.choices.map((row) => ({ value: String(row), label: `${row} days` }))} />
      ) : null}
      {id === "script"
        ? data.scriptStages.map((row) => (
            <label key={row.id} className="grid gap-1 text-sm">
              <span className="font-medium text-foreground">{row.label}</span>
              <Textarea aria-label={`The ${row.label} stage`} rows={2} value={text(row.id)} maxLength={2000} onChange={(event) => set(row.id)(event.target.value)} />
            </label>
          ))
        : null}
      {id === "packages" ? (
        <>
          <Input aria-label="Package name" placeholder="Package name" value={text("name")} maxLength={120} onChange={(event) => set("name")(event.target.value)} />
          <Textarea aria-label="What it includes" placeholder="What it includes" rows={2} value={text("includes")} maxLength={2000} onChange={(event) => set("includes")(event.target.value)} />
          <Input aria-label="Price a proposal may use" placeholder="Price a proposal may use, e.g. $4,500 a month" value={text("price")} maxLength={120} onChange={(event) => set("price")(event.target.value)} />
        </>
      ) : null}
      {id === "proof" ? <Textarea aria-label="Proof, one per line" placeholder="One result, case study or testimonial per line" rows={4} value={text("proof")} onChange={(event) => set("proof")(event.target.value)} /> : null}
      {id === "voice" ? (
        <>
          <Textarea aria-label="How your messages should sound" placeholder="Plain and warm. No exclamation marks." rows={2} value={text("voice")} maxLength={2000} onChange={(event) => set("voice")(event.target.value)} />
          <Input aria-label="Sign-off" placeholder="How you sign off, e.g. Nora" value={text("signOff")} maxLength={120} onChange={(event) => set("signOff")(event.target.value)} />
        </>
      ) : null}
      {id === "consent" ? (
        <>
          <Input aria-label="Consent tags" placeholder="CRM tags that mean a lead agreed to contact, separated by commas" value={text("tags") || data.consentTags.join(", ")} onChange={(event) => set("tags")(event.target.value)} />
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Channels Dealmaker may draft for</legend>
            {data.channels.map((row) => (
              <label key={row.id} className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={channels.includes(row.id)} onCheckedChange={(checked) => setChannels((now) => (checked ? [...now, row.id] : now.filter((item) => item !== row.id)))} />
                {row.label}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">Dealmaker only drafts. Nothing is sent without the approval it needs.</p>
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          <Check aria-hidden className="size-4" />
          Save answer
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={async () => (await run(() => actions.skip(id))) && onDone()}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}

/** The guided interview: one open question at a time, only for what Dealmaker could not read. */
export function InterviewPanel({ data, actions }: { data: InterviewData; actions: InterviewActions }) {
  const [round, setRound] = useState(0);
  const question = data.questions[0];
  if (!question) return null;
  const answered = data.total - data.questions.length;
  return (
    <Panel className="grid min-w-0 gap-4 p-4 sm:p-6" data-playbook-interview>
      <SectionTitle icon={MessageSquareWarning} aside={<span className="text-xs text-muted-foreground">{data.questions.length} left of {data.total}</span>}>
        A few questions only you can answer
      </SectionTitle>
      <p className="text-sm text-muted-foreground">
        Dealmaker read your CRM and Playbook first and asks only what it could not find. {answered > 0 ? `${answered} already answered or found.` : "About ten minutes in all."}
      </p>
      <div className="grid gap-1">
        <p className="font-medium text-foreground">{question.title}</p>
        <p className="text-sm text-muted-foreground">{question.ask}</p>
      </div>
      {data.canEdit ? <QuestionForm key={`${question.id}-${round}`} data={data} id={question.id} actions={actions} onDone={() => setRound((now) => now + 1)} /> : <p className="text-sm text-muted-foreground">An Owner, Admin or Member can answer these.</p>}
    </Panel>
  );
}
