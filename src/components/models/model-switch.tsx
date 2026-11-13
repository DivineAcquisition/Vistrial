"use client";

import { Fragment } from "react";

import { Check, ChevronDown } from "@/components/icons";
import { ModelLogo, type ModelFamily } from "@/components/models/model-mark";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

/** One model in the switch, as the server describes it (convex/models.ts `options`). Only models that can run the work are sent. */
export type ModelOption = {
  /** The model's id: what is sent back when it is picked. Never shown. */
  id: string;
  family: ModelFamily;
  familyName: string;
  /** The model's plain name. */
  name: string;
  /** "Usually costs less", "Usually costs more", or null when that cannot be said. */
  cost: string | null;
  /** The lighter model Fast work runs on, when it is not this one. */
  fastName?: string | null;
  /** How far a run's credit limit is raised on this model, Thorough and Fast. 1 for most. */
  capScale?: number;
  fastCapScale?: number;
};

export type ModelSwitchProps = {
  options: ModelOption[];
  /** The model this work will run on. Null while it is being read, or when the platform's model is not one in the list. */
  value: string | null;
  onChange?: (id: string) => void;
  /** Fast work runs on a model's lighter companion; the row says so. */
  mode?: "thorough" | "fast";
  /** The work has started, or the person may not choose: the model is shown and cannot be changed. */
  locked?: boolean;
  className?: string;
  align?: "start" | "end";
};

/**
 * The model switch: which model does this piece of work. Models are grouped under their maker's mark. Only
 * models that can do this work here are listed; the rest are simply not there.
 */
export function ModelSwitch({ options, value, onChange, mode = "thorough", locked, className, align = "start" }: ModelSwitchProps) {
  const current = options.find((row) => row.id === value) ?? null;
  if (options.length === 0) return null;
  const families = [...new Set(options.map((row) => row.family))];
  const noteOf = (row: ModelOption) => [row.cost, mode === "fast" && row.fastName ? `Fast uses ${row.fastName}` : null].filter(Boolean).join(" · ");
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            disabled={locked}
            aria-label={current ? `Model: ${current.name}${locked ? "" : ". Change model"}` : "Choose a model"}
            className={cn(
              "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 disabled:hover:text-muted-foreground",
              className,
            )}
          />
        }
      >
        {current ? <ModelLogo family={current.family} /> : null}
        <span className="truncate text-foreground">{current ? current.name : "Model"}</span>
        {locked ? null : <ChevronDown aria-hidden className="size-3 shrink-0" />}
      </MenuTrigger>
      <MenuPopup align={align} className="max-h-[min(28rem,70vh)] min-w-64 overflow-y-auto">
        {families.map((family) => {
          const rows = options.filter((row) => row.family === family);
          return (
            <Fragment key={family}>
              <MenuGroup>
                <MenuGroupLabel className="flex items-center gap-2">
                  <ModelLogo family={family} />
                  {rows[0].familyName}
                </MenuGroupLabel>
                {rows.map((row) => {
                  const note = noteOf(row);
                  return (
                    <MenuItem key={row.id} onClick={() => onChange?.(row.id)} className="items-start">
                      {row.id === value ? <Check aria-hidden className="mt-0.5" /> : <span className="size-4 shrink-0" />}
                      <span className="grid min-w-0 gap-0.5">
                        <span>{row.name}</span>
                        {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
                      </span>
                    </MenuItem>
                  );
                })}
              </MenuGroup>
              <MenuSeparator />
            </Fragment>
          );
        })}
        <MenuItem disabled>
          <span className="size-4 shrink-0" />
          More models coming soon
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

/** How far the credit limit of a run is raised on the model picked, for the mode. 1 when nothing is picked or the model costs no more. */
export function capScaleOf(model: Pick<ModelSwitchProps, "options" | "value"> | null | undefined, mode: "thorough" | "fast" = "thorough"): number {
  const row = model?.options.find((option) => option.id === model.value);
  return (mode === "fast" ? row?.fastCapScale : row?.capScale) ?? 1;
}
