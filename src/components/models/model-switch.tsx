"use client";

import { Check, ChevronDown } from "@/components/icons";
import { ModelLogo, type ModelFamily } from "@/components/models/model-mark";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

/** One family in the switch, as the server describes it (convex/models.ts `options`). */
export type ModelOption = {
  family: ModelFamily;
  label: string;
  /** The model's plain name for Thorough work and for Fast work. */
  thorough: string;
  fast: string;
  /** Why it cannot run this work here, or null when it can. */
  off: string | null;
  /** "Usually costs less", "Usually costs more", "About the same cost", or null when that cannot be said. */
  cost: string | null;
};

export type ModelSwitchProps = {
  options: ModelOption[];
  /** The family this work will run on. Null while it is being read, or when the platform's model is of no known family. */
  value: ModelFamily | null;
  onChange?: (family: ModelFamily) => void;
  /** Fast work uses each family's lighter model, so the name shown follows it. */
  mode?: "thorough" | "fast";
  /** The work has started, or the person may not choose: the model is shown and cannot be changed. */
  locked?: boolean;
  className?: string;
  align?: "start" | "end";
};

/**
 * The model switch: which model does this piece of work. Three families, each with its maker's mark and the
 * model's plain name. A family that cannot run this work here is shown greyed with the reason, never hidden.
 */
export function ModelSwitch({ options, value, onChange, mode = "thorough", locked, className, align = "start" }: ModelSwitchProps) {
  const current = options.find((row) => row.family === value) ?? null;
  if (options.length === 0) return null;
  const nameOf = (row: ModelOption) => (mode === "fast" ? row.fast : row.thorough);
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            disabled={locked}
            aria-label={current ? `Model: ${nameOf(current)}${locked ? "" : ". Change model"}` : "Choose a model"}
            className={cn(
              "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 disabled:hover:text-muted-foreground",
              className,
            )}
          />
        }
      >
        {current ? <ModelLogo family={current.family} /> : null}
        <span className="truncate text-foreground">{current ? nameOf(current) : "Model"}</span>
        {locked ? null : <ChevronDown aria-hidden className="size-3 shrink-0" />}
      </MenuTrigger>
      <MenuPopup align={align} className="min-w-64">
        <MenuGroup>
          <MenuGroupLabel>Model</MenuGroupLabel>
          {options.map((row) => (
            <MenuItem key={row.family} disabled={Boolean(row.off)} onClick={() => onChange?.(row.family)} className="items-start">
              {row.family === value ? <Check aria-hidden className="mt-0.5" /> : <span className="size-4 shrink-0" />}
              <span className="grid min-w-0 gap-0.5">
                <span className="flex items-center gap-2">
                  <ModelLogo family={row.family} />
                  <span>{nameOf(row)}</span>
                </span>
                {row.off ? <span className="text-xs text-muted-foreground">{row.off}</span> : row.cost ? <span className="text-xs text-muted-foreground">{row.cost}</span> : null}
              </span>
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem disabled>
          <span className="size-4 shrink-0" />
          More models coming soon
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
