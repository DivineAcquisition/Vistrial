"use client";

import { cn } from "@/lib/utils";

export type SuggestionItem = { label: string; value?: string };

export function Suggestions({
  items,
  onSelect,
  disabled = false,
  className,
}: {
  items: SuggestionItem[];
  onSelect: (item: SuggestionItem) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          disabled={disabled}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-sm text-card-foreground transition-colors hover:border-brand-500/50 hover:bg-brand-500/5 disabled:opacity-64"
          onClick={() => onSelect(item)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
