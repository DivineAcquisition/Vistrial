"use client";

import { ToolMark } from "@/components/connectors/tool-mark";
import { AgentGlyph } from "@/components/live/agent-identity";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { AGENT_LIST } from "@/lib/agents/roster";
import { CASE_FILE } from "@/lib/marketing/copy";
import { EXAMPLE, HERO, HOW, INDUSTRIES } from "@/lib/marketing/content";
import { GlowPanel } from "@/components/marketing/saas-frame";
import { marketingInset, marketingPanel } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

const STACK = [
  { key: "gohighlevel", label: "GoHighLevel" },
  { key: "google_calendar", label: "Google Calendar" },
  { key: "fathom", label: "Fathom" },
  { key: "fireflies", label: "Fireflies" },
  { key: null, label: "Case file" },
  { key: null, label: "Approval before send" },
] as const;

function StackChip({ label, logo, delay }: { label: string; logo: string | null; delay: string }) {
  return (
    <span
      className="inline-flex animate-vistrial-highlight items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm font-medium text-strong motion-reduce:animate-none"
      style={{ animationDelay: delay }}
    >
      {logo ? <ToolMark id={logo} size={22} /> : null}
      {label}
    </span>
  );
}

/** What the record is built from. Names only the connectors the product actually describes. */
export function StackStrip() {
  return (
    <div className="border-y border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
        <p className="max-w-xs shrink-0 text-sm leading-relaxed text-muted-foreground">
          {HOW.steps[0].body.split(".")[0]}.
        </p>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
          {STACK.map((item, index) => (
            <li key={item.label}>
              <StackChip label={item.label} logo={item.key} delay={`${index * 0.35}s`} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CaseFileBoard() {
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <GlowPanel className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-200 uppercase">{HERO.exampleLabel}</p>
          <p className="text-sm text-strong">{EXAMPLE.business}</p>
        </div>
        <div className="grid sm:grid-cols-[11rem_1fr]">
          <ul className="space-y-2 border-b border-border p-3 sm:border-r sm:border-b-0">
            {AGENT_LIST.map((agent, index) => (
              <li
                key={agent.id}
                className="flex animate-vistrial-highlight items-center gap-2 rounded-md border border-border bg-muted px-2 py-2 motion-reduce:animate-none"
                style={{ animationDelay: `${index * 0.45}s` }}
              >
                <AgentGlyph agentId={agent.id} size="sm" />
                <span className="text-sm text-strong">{agent.name}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-2 p-4">
            <div>
              <p className="font-heading text-xl text-strong">{EXAMPLE.lead}</p>
              <p className="text-sm text-muted-foreground">{EXAMPLE.summary}</p>
            </div>
            <ul className="space-y-2">
              {CASE_FILE.parts.map((part, index) => (
                <li
                  key={part.id}
                  className="animate-vistrial-highlight rounded-md border border-border bg-muted px-3 py-2 motion-reduce:animate-none"
                  style={{ animationDelay: `${index * 0.35}s` }}
                >
                  <p className="text-sm font-medium text-strong">{part.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{part.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </GlowPanel>
      <ul className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {CASE_FILE.parts.map((part, index) => (
          <li key={part.id} className={cn(marketingInset, "px-4 py-3")}>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-200 uppercase">
              {String(index + 1).padStart(2, "0")}
            </p>
            <p className="mt-1 text-sm font-medium text-strong">{part.title}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IndustrySwitcher() {
  return (
    <Tabs defaultValue={INDUSTRIES.cards[0].id}>
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-border bg-muted p-1">
        {INDUSTRIES.cards.map((card) => (
          <TabsTab
            key={card.id}
            value={card.id}
            className="rounded-md px-3 py-2 text-muted-foreground data-active:border data-active:border-border data-active:bg-card data-active:text-strong"
          >
            {card.title}
          </TabsTab>
        ))}
      </TabsList>
      {INDUSTRIES.cards.map((card) => (
        <TabsPanel key={card.id} value={card.id} className="mt-4">
          <div className={cn(marketingPanel, "grid gap-6 p-5 lg:grid-cols-[0.8fr_1.2fr]")}>
            <div>
              <h3 className="font-heading text-2xl text-strong">{card.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{card.motion}</p>
            </div>
            <ul className="space-y-2">
              {card.watches.map((item, index) => (
                <li
                  key={item}
                  className="animate-vistrial-highlight rounded-md border border-border bg-muted px-3 py-3 text-sm text-strong motion-reduce:animate-none"
                  style={{ animationDelay: `${index * 0.4}s` }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </TabsPanel>
      ))}
    </Tabs>
  );
}
