"use client";

import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { type FormEvent, type ReactNode } from "react";

import { IntentSelector } from "@/components/agent-elements/intent-selector";
import { Suggestions, type SuggestionItem } from "@/components/agent-elements/suggestions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AGENT_INTENT_COPY, type AgentIntent } from "@/lib/agent-elements/intent";
import { cn } from "@/lib/utils";

export function AgentComposer({
  value,
  onChange,
  onSend,
  onStop,
  pending = false,
  intent,
  onIntentChange,
  showIntent = true,
  placeholder = "Ask about your leads, calls, and what to do next",
  suggestions = [],
  disabled = false,
  contextLabel,
  onClearContext,
  extra,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop?: () => void;
  pending?: boolean;
  intent: AgentIntent;
  onIntentChange?: (intent: AgentIntent) => void;
  showIntent?: boolean;
  placeholder?: string;
  suggestions?: SuggestionItem[];
  disabled?: boolean;
  contextLabel?: string | null;
  onClearContext?: () => void;
  extra?: ReactNode;
}) {
  const canSend = !disabled && !pending && value.trim().length > 0;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = value.trim();
    if (!text || disabled || pending) return;
    onSend(text);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {suggestions.length ? (
        <Suggestions items={suggestions} disabled={disabled || pending} onSelect={(item) => onChange(item.value ?? item.label)} />
      ) : null}
      <div className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-xs transition-[border-color] focus-within:border-brand-500/55 [&_textarea]:resize-none">
        {contextLabel ? (
          <div className="flex px-1">
            <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-brand-500/10 py-0.5 ps-2 pe-0.5 text-xs text-card-foreground">
              <span className="truncate">About: {contextLabel}</span>
              {onClearContext ? (
                <button
                  type="button"
                  className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-card-foreground"
                  aria-label={`Stop asking about ${contextLabel}`}
                  onClick={onClearContext}
                >
                  ×
                </button>
              ) : null}
            </span>
          </div>
        ) : null}
        <Textarea
          unstyled
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled || pending}
          rows={2}
          aria-label="Message to Vistrial"
          className="min-h-16 bg-transparent px-2 py-1 text-base text-card-foreground"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
          {showIntent && onIntentChange ? <IntentSelector value={intent} onChange={onIntentChange} disabled={disabled || pending} described={false} /> : <span />}
          <div className="ms-auto flex items-center gap-2">
            {extra}
            {pending && onStop ? (
              <Button type="button" variant="primary" size="icon" className="size-8 rounded-full" aria-label="Stop" onClick={onStop}>
                <SquareIcon className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button type="submit" variant="primary" size="icon" className="size-8 rounded-full" aria-label="Send" disabled={!canSend}>
                <ArrowUpIcon className="size-4" />
              </Button>
            )}
          </div>
        </div>
        {showIntent ? <p className="px-1 pb-1 text-xs text-muted-foreground">{AGENT_INTENT_COPY[intent].description}</p> : null}
      </div>
    </form>
  );
}

export function ComposerShell({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-2", className)}>{children}</div>;
}
