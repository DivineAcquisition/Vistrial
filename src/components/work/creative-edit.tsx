"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";
import { cn } from "@/lib/utils";
import { COPY_MAX } from "../../../convex/skills/creativeProduction/shapes";

import type { CreativeView } from "./types";

type Variation = NonNullable<CreativeView["creative"]>["variations"][number];

export type VariationEdit = {
  variationKey: string;
  hook: string;
  primaryText: string;
  headline: string;
  cta: string;
  eyebrow: string;
  kicker: string;
  subline: string;
  labels: string[];
};

function Count({ value, max }: { value: string; max: number }) {
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        value.length > max ? "text-destructive" : "text-muted-foreground",
      )}
    >{`${value.length}/${max}`}</span>
  );
}

function Field({
  label,
  value,
  max,
  onChange,
  long,
}: {
  label: string;
  value: string;
  max: number;
  onChange: (value: string) => void;
  long?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="flex items-center justify-between gap-2 text-muted-foreground">
        {label} <Count value={value} max={max} />
      </span>
      {long ? (
        <Textarea
          rows={5}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

/**
 * A person's own changes to one variation before they approve the set. Saving runs the same checks on their
 * words as on the writer's, and says so if one no longer passes.
 */
export function VariationEditor({
  row,
  onSave,
  onClose,
}: {
  row: Variation;
  onSave: (edit: VariationEdit) => Promise<{ passed: boolean }>;
  onClose: () => void;
}) {
  const designed = Boolean(row.design?.visual);
  const [draft, setDraft] = useState({
    hook: row.hook,
    primaryText: row.primaryText,
    headline: row.headline,
    cta: row.cta,
    eyebrow: row.design?.eyebrow ?? "",
    kicker: row.design?.kicker ?? "",
    subline: row.design?.subline ?? "",
    labels: (row.design?.labels ?? []).join("\n"),
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const set = (key: keyof typeof draft) => (value: string) =>
    setDraft((old) => ({ ...old, [key]: value }));
  const labels = draft.labels
    .split("\n")
    .map((label) => label.trim())
    .filter(Boolean);
  const over =
    draft.hook.length > COPY_MAX.hook ||
    draft.primaryText.length > COPY_MAX.primaryText ||
    draft.headline.length > COPY_MAX.headline ||
    draft.cta.length > COPY_MAX.cta ||
    draft.eyebrow.length > COPY_MAX.eyebrow ||
    draft.kicker.length > COPY_MAX.kicker ||
    draft.subline.length > COPY_MAX.subline ||
    labels.length > COPY_MAX.labels ||
    labels.some((label) => label.length > COPY_MAX.label);
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setNotice("");
        void onSave({
          variationKey: row.key,
          hook: draft.hook,
          primaryText: draft.primaryText,
          headline: draft.headline,
          cta: draft.cta,
          eyebrow: draft.eyebrow,
          kicker: draft.kicker,
          subline: draft.subline,
          labels,
        }).then(
          () => {
            setBusy(false);
            onClose();
          },
          (problem: unknown) => {
            setBusy(false);
            setNotice(showError(problem, "That did not save."));
          },
        );
      }}
    >
      <Field
        label="Hook"
        value={draft.hook}
        max={COPY_MAX.hook}
        onChange={set("hook")}
      />
      <Field
        label="Text"
        value={draft.primaryText}
        max={COPY_MAX.primaryText}
        onChange={set("primaryText")}
        long
      />
      <Field
        label="Headline"
        value={draft.headline}
        max={COPY_MAX.headline}
        onChange={set("headline")}
      />
      <Field
        label="Button"
        value={draft.cta}
        max={COPY_MAX.cta}
        onChange={set("cta")}
      />
      {designed ? (
        <fieldset className="grid gap-3 rounded-lg border border-border p-2.5">
          <legend className="px-1 text-xs text-muted-foreground">
            Words on the designed ad
          </legend>
          <Field
            label="Top bar"
            value={draft.eyebrow}
            max={COPY_MAX.eyebrow}
            onChange={set("eyebrow")}
          />
          <Field
            label="Line above the headline"
            value={draft.kicker}
            max={COPY_MAX.kicker}
            onChange={set("kicker")}
          />
          <label className="grid gap-1 text-sm">
            <span className="flex items-center justify-between gap-2 text-muted-foreground">
              Labels on the picture, one per line
              <span
                className={cn(
                  "text-xs tabular-nums",
                  labels.length > COPY_MAX.labels ||
                    labels.some((label) => label.length > COPY_MAX.label)
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >{`${labels.length}/${COPY_MAX.labels}, ${COPY_MAX.label} characters each`}</span>
            </span>
            <Textarea
              rows={3}
              value={draft.labels}
              onChange={(event) => set("labels")(event.target.value)}
            />
          </label>
          <Field
            label="Line under the picture"
            value={draft.subline}
            max={COPY_MAX.subline}
            onChange={set("subline")}
          />
        </fieldset>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Saving checks your words the same way: new wording, on brand, and every
        result, price or promise backed. If one does not pass, you will see
        which.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || over}>
          {busy ? "Saving…" : "Save and check"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {notice ? (
          <span className="text-xs text-destructive">{notice}</span>
        ) : null}
      </div>
    </form>
  );
}
