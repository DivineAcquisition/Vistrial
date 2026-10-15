"use client";

import { useEffect, useState } from "react";

import { AgentGlyph } from "@/components/live/agent-identity";
import { Badge } from "@/components/ui/badge";
import { Marquee } from "@/components/ui/marquee";
import { EXAMPLE, HERO } from "@/lib/marketing/content";
import { AGENTS } from "@/lib/agents/roster";
import { marketingInset } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

export function HeroExample() {
  const [step, setStep] = useState<number | "still">("still");

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const timer = window.setInterval(() => {
      setStep((current) => {
        const index = current === "still" ? 0 : current + 1;
        return index % EXAMPLE.steps.length;
      });
    }, 2800);
    const onChange = () => {
      if (media.matches) {
        window.clearInterval(timer);
        setStep("still");
      }
    };
    media.addEventListener("change", onChange);
    return () => {
      window.clearInterval(timer);
      media.removeEventListener("change", onChange);
    };
  }, []);

  const motion = step !== "still";
  const activeIndex = motion ? step : EXAMPLE.steps.length - 1;
  const active = EXAMPLE.steps[activeIndex];

  return (
    <div className="space-y-4 text-left" aria-label={HERO.exampleLabel}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-white/25" />
          <span className="size-2 rounded-full bg-white/25" />
          <span className="size-2 rounded-full bg-brand-400" />
        </div>
        <Badge variant="outline" size="sm">
          {HERO.exampleLabel}
        </Badge>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-heading text-2xl tracking-tight text-white">{EXAMPLE.lead}</p>
          <p className="text-sm text-silver">{EXAMPLE.business}</p>
        </div>
        <p className="text-[11px] font-medium tracking-[0.14em] text-brand-200 uppercase">Case file</p>
      </div>

      <div className={cn(marketingInset, "overflow-hidden")}>
        <ul className="flex flex-wrap gap-2 p-2 motion-safe:hidden">
          {EXAMPLE.sources.map((source) => (
            <li key={source}>
              <SourceChip>{source}</SourceChip>
            </li>
          ))}
        </ul>
        <Marquee pauseOnHover className="[--duration:32s] motion-reduce:hidden" aria-hidden>
          {EXAMPLE.sources.map((source) => (
            <SourceChip key={source}>{source}</SourceChip>
          ))}
        </Marquee>
      </div>

      <p className="text-sm leading-relaxed text-silver">{EXAMPLE.summary}</p>

      <div className="h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300 transition-[width] duration-700 motion-reduce:transition-none"
          style={{ width: `${((activeIndex + 1) / EXAMPLE.steps.length) * 100}%` }}
        />
      </div>

      <ol className="space-y-2">
        {EXAMPLE.steps.map((item, index) => {
          const on = index === activeIndex;
          return (
            <li
              key={item.agent}
              className={cn(
                "flex items-start gap-2 rounded-xl border px-3 py-2 transition-colors",
                on ? "border-brand-300 bg-[#2a2540]" : "border-[#6b6784] bg-[#12111a]",
              )}
            >
              <AgentGlyph agentId={item.agent} size="sm" working={motion && on} />
              <span>
                <span className="block text-sm font-medium text-card-foreground">{AGENTS[item.agent].name}</span>
                <span className="block text-sm text-silver">{item.line}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {motion ? <p className="sr-only">{active.line}</p> : null}

      <div className={cn(marketingInset, "p-3")}>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">Draft for {EXAMPLE.lead}</p>
        <p className="mt-2 text-sm leading-relaxed text-white">{EXAMPLE.draft}</p>
        <p className="mt-2 text-xs leading-relaxed text-silver">{EXAMPLE.draftStatus}</p>
      </div>
    </div>
  );
}

function SourceChip({ children }: { children: string }) {
  return (
    <span className="rounded-lg border border-[#6b6784] bg-[#1c1a27] px-3 py-1 text-xs text-white">
      {children}
    </span>
  );
}

export function ApprovalExample() {
  return (
    <div className="overflow-hidden rounded-xl border border-[#8a86a3] bg-[#1c1a27] text-left" aria-label={HERO.exampleLabel}>
      <div className="flex items-center justify-between gap-3 border-b border-[#6b6784] px-4 py-3">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-300 uppercase">{HERO.exampleLabel}</p>
        <span className="size-2 rounded-full bg-brand-400" aria-hidden />
      </div>
      <div className="p-4">
        <p className="text-sm font-medium text-white">Draft for {EXAMPLE.lead}</p>
        <p className="mt-2 text-sm leading-relaxed text-silver">{EXAMPLE.draft}</p>
        <p className="mt-3 text-sm text-silver">{EXAMPLE.draftStatus}</p>
      </div>
    </div>
  );
}
