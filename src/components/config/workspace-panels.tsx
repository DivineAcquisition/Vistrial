"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  checkReadiness,
  decideNotice,
  previewTemplateSwitch,
  setAutoAccept,
  switchTemplate,
  type ConfigActionResult,
  type SwitchPreview,
} from "@/app/(workspace)/app/settings/configuration/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { describeValue } from "@/lib/config/format";
import { FIELD_BY_KEY } from "@/lib/config/registry";
import type { TestRunStep } from "@/lib/config/test-run";
import { bodyText, captionText, errorClass, helperClass, sectionTitle } from "@/lib/ui";

function useRun() {
  const router = useRouter();
  const [result, setResult] = useState<ConfigActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ConfigActionResult>) =>
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  return { result, pending, run };
}

function Outcome({ result }: { result: ConfigActionResult | null }) {
  if (!result) return null;
  if (!result.ok) return <p className={errorClass}>{result.error}</p>;
  return result.message ? <p className={helperClass}>{result.message}</p> : null;
}

export function ReadinessPanel(props: {
  orgId: string;
  status: string;
  version: string;
  issues: Array<{ key: string; message: string }>;
  readiness: { config_version: string; ready: boolean; checked_at: string; test_run: TestRunStep[] | null } | null;
}) {
  const { result, pending, run } = useRun();
  const current = props.readiness?.config_version === props.version;
  const ready = Boolean(current && props.readiness?.ready);
  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={sectionTitle}>Ready to go live?</h2>
        <StatusBadge
          label={ready ? "Ready" : props.issues.length ? `${props.issues.length} to fix` : current ? "Checked, not marked ready" : "Not checked yet"}
          tone={ready ? "good" : props.issues.length ? "critical" : "warning"}
        />
      </div>
      <p className={bodyText}>
        {props.status === "active"
          ? "This workspace is live. Changes apply straight away; a required setting cannot be cleared."
          : "A workspace goes live only after a check passes for its current configuration. Any later change needs a new check."}
      </p>
      {props.issues.length ? (
        <ul className="mt-3 space-y-1">
          {props.issues.map((issue) => (
            <li key={`${issue.key}-${issue.message}`} className="text-sm">
              <a href={`#field-${issue.key}`} className="text-flag-critical underline-offset-2 hover:underline">
                {FIELD_BY_KEY[issue.key]?.label ?? issue.key}
              </a>
              <span className="text-muted-foreground"> — {issue.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {current && props.readiness?.test_run ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {props.readiness.test_run.map((step) => (
            <div key={step.title} className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-card-foreground">{step.title}</span>
                <StatusBadge label={step.ok ? "OK" : "Check"} tone={step.ok ? "good" : "warning"} />
              </div>
              {step.lines.map((line) => (
                <p key={line} className={captionText}>
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => checkReadiness(props.orgId, false))}>
          Run test (sends nothing)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={pending || props.issues.length > 0}
          onClick={() => run(() => checkReadiness(props.orgId, true))}
        >
          Mark ready to go live
        </Button>
      </div>
      <p className={helperClass}>Configuration version {props.version}</p>
      <Outcome result={result} />
    </Panel>
  );
}

export type NoticeView = {
  id: string;
  orgName?: string;
  title: string;
  status: string;
  note: string | null;
  createdAt: string;
  postponedUntil: string | null;
  changes: Array<{ key: string; before?: unknown; after?: unknown }>;
};

export function NoticeCard({ notice }: { notice: NoticeView }) {
  const { result, pending, run } = useRun();
  const [note, setNote] = useState("");
  const pushed = notice.status === "pushed";
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-card-foreground">{notice.title}</span>
        {notice.orgName ? <span className={captionText}>{notice.orgName}</span> : null}
        <StatusBadge label={notice.status === "postponed" ? "Postponed" : pushed ? "Applied (locked rule)" : "Waiting for review"} tone={pushed ? "warning" : "brand"} />
      </div>
      {notice.note ? <p className={helperClass}>Why: {notice.note}</p> : null}
      <ul className="mt-2 space-y-2">
        {notice.changes.map((change) => (
          <li key={change.key} className="text-sm">
            <span className="text-card-foreground">{FIELD_BY_KEY[change.key]?.label ?? change.key}</span>
            <div className="grid gap-1 sm:grid-cols-2">
              <span className={captionText}>Now: {describeValue(change.key, change.before as never)}</span>
              <span className={captionText}>After: {describeValue(change.key, change.after as never)}</span>
            </div>
          </li>
        ))}
      </ul>
      {pushed ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input density="compact" className="w-56" placeholder="Note (optional)" value={note} onChange={(event) => setNote(event.target.value)} />
          <Button type="button" size="sm" variant="primary" disabled={pending} onClick={() => run(() => decideNotice({ noticeId: notice.id, decision: "accept", note }))}>
            Accept
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => decideNotice({ noticeId: notice.id, decision: "decline", note }))}>
            Decline
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideNotice({ noticeId: notice.id, decision: "postpone", note, postponeDays: 7 }))}>
            Postpone a week
          </Button>
        </div>
      )}
      <Outcome result={result} />
    </div>
  );
}

export function TemplateSwitchPanel(props: {
  orgId: string;
  currentTemplateId: string | null;
  templates: Array<{ id: string; name: string; status: string }>;
  autoAccept: boolean;
  onboarding: boolean;
}) {
  const { result, pending, run } = useRun();
  const [templateId, setTemplateId] = useState("");
  const [preview, setPreview] = useState<SwitchPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [drop, setDrop] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState("");
  const [loading, startLoading] = useTransition();
  const choices = props.templates.filter((template) => template.status === "active" && template.id !== props.currentTemplateId);

  const load = (id: string) => {
    setTemplateId(id);
    setPreview(null);
    setPreviewError(null);
    setDrop([]);
    setConfirm(false);
    if (!id) return;
    startLoading(async () => {
      const outcome = await previewTemplateSwitch(props.orgId, id);
      if (outcome.ok) setPreview(outcome);
      else setPreviewError(outcome.error);
    });
  };

  return (
    <Panel className="p-5 sm:p-6">
      <h2 className={sectionTitle}>Template</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Switch
          checked={props.autoAccept}
          disabled={pending || !props.onboarding}
          onCheckedChange={(on) => run(() => setAutoAccept(props.orgId, on))}
          label="Take template and default updates automatically while onboarding"
        />
      </div>
      <p className={helperClass}>
        {props.onboarding
          ? "Off means every update waits for review here."
          : "Live workspaces always review updates. Locked rules still apply straight away."}
      </p>

      <div className="mt-4">
        <Select
          aria-label="Switch to template"
          value={templateId}
          placeholder={choices.length ? "Switch to another template…" : "No other active templates"}
          disabled={!choices.length || loading}
          options={[{ value: "", label: "Switch to another template…" }, ...choices.map((template) => ({ value: template.id, label: template.name }))]}
          onChange={(event) => load(event.target.value)}
        />
      </div>
      {loading ? <p className={helperClass}>Comparing…</p> : null}
      {previewError ? <p className={errorClass}>{previewError}</p> : null}
      {preview ? (
        <div className="mt-3 space-y-3">
          <p className={bodyText}>
            {preview.changes.length
              ? `${preview.changes.length} setting${preview.changes.length === 1 ? "" : "s"} would change:`
              : "Nothing this workspace uses would change."}
          </p>
          <ul className="space-y-1">
            {preview.changes.map((change) => (
              <li key={change.key} className="text-sm">
                <span className="text-card-foreground">{change.label}</span>
                <span className={captionText}>
                  {" "}
                  {change.before} → {change.after}
                </span>
              </li>
            ))}
          </ul>
          {preview.overrides.length ? (
            <div>
              <p className={bodyText}>This workspace&apos;s own settings stay unless you tick them to drop:</p>
              {preview.overrides.map((override) => (
                <label key={override.key} className="mt-1 flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={drop.includes(override.key)}
                    onCheckedChange={(on) => setDrop(on ? [...drop, override.key] : drop.filter((key) => key !== override.key))}
                  />
                  <span>
                    {override.label} <span className={captionText}>({override.value})</span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          <Input density="compact" placeholder="Why (recorded in the history)" value={note} onChange={(event) => setNote(event.target.value)} />
          {preview.live ? (
            <label className="flex items-center gap-2 text-sm text-card-foreground">
              <Checkbox checked={confirm} onCheckedChange={(on) => setConfirm(Boolean(on))} />
              This workspace is live. I have reviewed what changes.
            </label>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={pending || (preview.live && !confirm)}
            onClick={() => run(() => switchTemplate({ orgId: props.orgId, templateId, dropKeys: drop, confirm, note }))}
          >
            Switch template
          </Button>
        </div>
      ) : null}
      <Outcome result={result} />
    </Panel>
  );
}
