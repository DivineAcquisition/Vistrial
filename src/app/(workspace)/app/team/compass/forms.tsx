"use client";

import { useState, useTransition } from "react";

import {
  deleteHelpArticleAction,
  saveCompassLimitsAction,
  saveHelpArticleAction,
  saveWorkspaceLimitsAction,
  setCompassEnabledAction,
  type StaffResult,
} from "@/app/(workspace)/app/team/compass/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HELP_ARTICLE_TOPICS } from "@/lib/compass/help-topics";
import { errorClass, helperClass } from "@/lib/ui";

function Outcome({ result }: { result: StaffResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p className={helperClass} role="status">
      {result.message ?? "Saved."}
    </p>
  ) : (
    <p className={errorClass} role="alert">
      {result.error}
    </p>
  );
}

const LIMIT_FIELDS: Array<[string, string]> = [
  ["person_per_minute", "Questions per minute, per person"],
  ["person_per_day", "Questions per day, per person"],
  ["workspace_per_day", "Questions per day, per workspace"],
  ["workspace_per_month", "Questions per month, per workspace"],
  ["max_question_chars", "Longest question, in characters"],
  ["max_turns", "Questions in one conversation before starting fresh"],
  ["warn_at_percent", "Warn at this percent of a limit"],
  ["drafts_per_person_per_day", "Relay drafts asked from Compass, per person per day"],
];

export function CompassLimitsForm({ limits }: { limits: Record<string, number> }) {
  const [result, setResult] = useState<StaffResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid max-w-2xl gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const patch = Object.fromEntries(LIMIT_FIELDS.map(([key]) => [key, Number(form.get(key))]));
        startTransition(async () => setResult(await saveCompassLimitsAction(patch)));
      }}
    >
      {LIMIT_FIELDS.map(([key, label]) => (
        <Field key={key} label={label} name={key}>
          <Input name={key} type="number" min={1} defaultValue={limits[key]} required />
        </Field>
      ))}
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Button type="submit" variant="primary" disabled={pending} className="self-start">
          Save limits
        </Button>
        <Outcome result={result} />
      </div>
    </form>
  );
}

export function WorkspaceLimitsForm({ workspaces }: { workspaces: Array<{ id: string; name: string }> }) {
  const [result, setResult] = useState<StaffResult | null>(null);
  const [pending, startTransition] = useTransition();
  const num = (value: FormDataEntryValue | null) => (value === null || String(value).trim() === "" ? null : Number(value));
  return (
    <form
      className="grid max-w-2xl gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () =>
          setResult(
            await saveWorkspaceLimitsAction({
              orgId: String(form.get("org_id") ?? ""),
              perDay: num(form.get("per_day")),
              perMonth: num(form.get("per_month")),
              personPerDay: num(form.get("person_per_day")),
              note: String(form.get("note") ?? ""),
            })
          )
        );
      }}
    >
      <Field label="Workspace" name="org_id" className="sm:col-span-2">
        <Select name="org_id" required defaultValue="">
          <option value="" disabled>
            Pick a workspace
          </option>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Questions per day" name="per_day">
        <Input name="per_day" type="number" min={1} placeholder="Platform limit" />
      </Field>
      <Field label="Questions per month" name="per_month">
        <Input name="per_month" type="number" min={1} placeholder="Platform limit" />
      </Field>
      <Field label="Questions per person per day" name="person_per_day">
        <Input name="person_per_day" type="number" min={1} placeholder="Platform limit" />
      </Field>
      <Field label="Why" name="note">
        <Input name="note" maxLength={300} placeholder="For example: busy launch month" />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Button type="submit" variant="secondary" disabled={pending} className="self-start">
          Save for this workspace
        </Button>
        <Outcome result={result} />
      </div>
    </form>
  );
}

export function CompassSwitch({ on, workspaceName }: { on: boolean; workspaceName: string }) {
  const [result, setResult] = useState<StaffResult | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <p className="text-sm text-card-foreground">
        Compass is <strong>{on ? "on" : "off"}</strong> for {workspaceName}.
      </p>
      <Field label={on ? "Why switch it off" : "Note (optional)"} name="reason">
        <Input name="reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
      </Field>
      <Button
        type="button"
        variant={on ? "destructive-outline" : "primary"}
        disabled={pending}
        className="self-start"
        onClick={() => startTransition(async () => setResult(await setCompassEnabledAction(!on, reason)))}
      >
        {on ? "Switch Compass off" : "Switch Compass on"}
      </Button>
      <Outcome result={result} />
    </div>
  );
}

export type HelpArticleRow = {
  slug: string;
  topic: string;
  question: string;
  body: string;
  link_label: string | null;
  link_href: string | null;
  sort: number;
  published: boolean;
};

export function HelpArticleForm({ article }: { article: HelpArticleRow | null }) {
  const [result, setResult] = useState<StaffResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () =>
          setResult(
            await saveHelpArticleAction({
              slug: String(form.get("slug") ?? "").trim(),
              topic: String(form.get("topic") ?? "general"),
              question: String(form.get("question") ?? ""),
              body: String(form.get("body") ?? ""),
              linkLabel: String(form.get("link_label") ?? ""),
              linkHref: String(form.get("link_href") ?? ""),
              sort: Number(form.get("sort") ?? 100),
              published: form.get("published") === "on",
            })
          )
        );
      }}
    >
      <Field label="Address (used after #)" name="slug">
        <Input name="slug" defaultValue={article?.slug ?? ""} readOnly={Boolean(article)} required pattern="[a-z0-9][a-z0-9-]{1,60}" />
      </Field>
      <Field label="Topic" name="topic">
        <Select name="topic" defaultValue={article?.topic ?? "general"}>
          {HELP_ARTICLE_TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Question" name="question" className="sm:col-span-2">
        <Input name="question" defaultValue={article?.question ?? ""} maxLength={200} required />
      </Field>
      <Field label="Answer" name="body" className="sm:col-span-2">
        <Textarea name="body" defaultValue={article?.body ?? ""} maxLength={4000} rows={5} required />
      </Field>
      <Field label="Link label" name="link_label">
        <Input name="link_label" defaultValue={article?.link_label ?? ""} maxLength={60} />
      </Field>
      <Field label="Link (starts /app/)" name="link_href">
        <Input name="link_href" defaultValue={article?.link_href ?? ""} maxLength={200} />
      </Field>
      <Field label="Order" name="sort">
        <Input name="sort" type="number" defaultValue={article?.sort ?? 100} />
      </Field>
      <label className="flex items-center gap-2 self-end text-sm text-card-foreground">
        <input type="checkbox" name="published" defaultChecked={article?.published ?? true} />
        Published
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {article ? "Save" : "Add article"}
        </Button>
        {article ? (
          <Button
            type="button"
            variant="destructive-outline"
            size="sm"
            disabled={pending}
            onClick={() => startTransition(async () => setResult(await deleteHelpArticleAction(article.slug)))}
          >
            Delete
          </Button>
        ) : null}
        <Outcome result={result} />
      </div>
    </form>
  );
}
