"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveConfigField, setFieldLock, type ConfigActionResult } from "@/app/(workspace)/app/settings/configuration/actions";
import { ValueInput } from "@/components/config/value-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { describeValue } from "@/lib/config/format";
import { FIELD_BY_KEY } from "@/lib/config/registry";
import type { ConfigLevel, ConfigValue, ResolvedField } from "@/lib/config/types";
import { captionText, errorClass, helperClass } from "@/lib/ui";

export type FieldRowProps = {
  fieldKey: string;
  level: ConfigLevel;
  layerId: string;
  layerVersion: number;
  /** What this level itself holds for the field, if anything. */
  ownValue: ConfigValue | undefined;
  /** The answer after all three levels (workspaces), or this level over the platform default (templates). */
  resolved: ResolvedField;
  /** Locked at this level (templates and the platform default only). */
  lockedHere: boolean;
  /** Changing a locked rule is a push: Platform Admin only. */
  canLock: boolean;
  canEdit: boolean;
  problems: string[];
};

function sourceTone(resolved: ResolvedField): "brand" | "neutral" | "good" | "warning" | "critical" {
  if (resolved.source === "missing") return "critical";
  if (resolved.lockedAt) return "warning";
  if (resolved.source === "workspace") return "brand";
  return "neutral";
}

function sourceLabel(resolved: ResolvedField, level: ConfigLevel): string {
  if (resolved.source === "missing") return "Not set";
  if (resolved.lockedAt && resolved.tightened) return "Locked · stricter here";
  if (resolved.lockedAt) return `Locked by ${resolved.lockedAt === "platform" ? "platform" : "template"}`;
  if (resolved.source === level) return level === "workspace" ? "Overridden here" : "Set here";
  return resolved.source === "platform" ? "Platform default" : "From template";
}

export function FieldRow(props: FieldRowProps) {
  const field = FIELD_BY_KEY[props.fieldKey];
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ConfigValue | undefined>(props.ownValue ?? props.resolved.value);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ConfigActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  // At the platform default and in templates, a locked rule applies everywhere at once.
  const isPush = props.level !== "workspace" && (props.lockedHere || props.resolved.lockedAt !== null);
  const run = (action: () => Promise<ConfigActionResult>, after?: () => void) =>
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) {
        after?.();
        router.refresh();
      }
    });

  const save = () =>
    run(
      () =>
        saveConfigField({
          layerId: props.layerId,
          expectedVersion: props.layerVersion,
          key: props.fieldKey,
          value: draft,
          note,
        }),
      () => setEditing(false)
    );

  return (
    <div id={`field-${props.fieldKey}`} className="scroll-mt-24 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-card-foreground">{field.label}</span>
            {field.required ? <span className={captionText}>Required</span> : null}
            <StatusBadge label={sourceLabel(props.resolved, props.level)} tone={sourceTone(props.resolved)} />
          </div>
          <p className={helperClass}>{field.help}</p>
          {!editing ? (
            <p className="mt-2 whitespace-pre-line text-sm text-card-foreground">{describeValue(field, props.resolved.value)}</p>
          ) : null}
          {props.resolved.ignoredOverride ? (
            <p className={helperClass}>
              A {props.resolved.ignoredOverride.level} value is ignored: {props.resolved.ignoredOverride.reason}
            </p>
          ) : null}
          {props.problems.map((problem) => (
            <p key={problem} className={errorClass}>
              {problem}
            </p>
          ))}
        </div>
        {props.canEdit && !editing ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(props.ownValue ?? props.resolved.value);
                setEditing(true);
                setResult(null);
              }}
            >
              {props.resolved.lockedAt && props.level === "workspace" ? (field.tighten ? "Make stricter" : "Locked") : "Edit"}
            </Button>
            {props.ownValue !== undefined ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    saveConfigField({ layerId: props.layerId, expectedVersion: props.layerVersion, key: props.fieldKey, note })
                  )
                }
              >
                Reset to inherited
              </Button>
            ) : null}
            {props.canLock && props.level !== "workspace" ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending || !note.trim()}
                title={note.trim() ? undefined : "Add a note below first"}
                onClick={() =>
                  run(() =>
                    setFieldLock({
                      layerId: props.layerId,
                      expectedVersion: props.layerVersion,
                      key: props.fieldKey,
                      locked: !props.lockedHere,
                      note,
                    })
                  )
                }
              >
                {props.lockedHere ? "Unlock" : "Lock"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {props.canLock && props.level !== "workspace" && !editing ? (
        <Input
          density="compact"
          className="mt-2 max-w-md"
          placeholder="Reason, needed to lock or unlock"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      ) : null}

      {editing ? (
        <div className="mt-3 space-y-3">
          <ValueInput field={field} value={draft} onChange={setDraft} disabled={pending} />
          {isPush || props.level !== "workspace" ? (
            <div>
              <Input
                density="compact"
                className="max-w-xl"
                placeholder={isPush ? "Why (required: this applies to every workspace now)" : "Note for the history (optional)"}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              {isPush ? (
                <p className={helperClass}>
                  This rule is locked, so the change applies to every workspace straight away and each one is told.
                </p>
              ) : (
                <p className={helperClass}>Live workspaces get a review notice; nothing changes for them until someone accepts.</p>
              )}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="primary" disabled={pending || (isPush && !note.trim())} onClick={save}>
              {pending ? "Saving" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {result && !result.ok ? (
        <p className={errorClass}>
          {result.error}
          {result.conflict ? " " : null}
          {result.conflict ? (
            <button type="button" className="underline" onClick={() => router.refresh()}>
              Reload
            </button>
          ) : null}
        </p>
      ) : null}
      {result && result.ok && result.message ? <p className={helperClass}>{result.message}</p> : null}
    </div>
  );
}
