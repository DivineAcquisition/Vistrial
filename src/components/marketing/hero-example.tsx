"use client";

import { useEffect, useState } from "react";

import { AgentGlyph } from "@/components/live/agent-identity";
import { EXAMPLE, HERO } from "@/lib/marketing/content";
import { AGENTS } from "@/lib/agents/roster";

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
  const active = motion ? EXAMPLE.steps[step] : null;

  return (
    <div className="space-y-4 text-left" aria-label={HERO.exampleLabel}>
      <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-300 uppercase">{HERO.exampleLabel}</p>
      <div className="flex flex-wrap gap-2">
        {EXAMPLE.sources.map((source) => (
          <span key={source} className="rounded-full border border-white/10 px-3 py-1 text-xs text-silver">
            {source}
          </span>
        ))}
      </div>
      <div>
        <p className="font-heading text-lg text-white">{EXAMPLE.lead}</p>
        <p className="text-sm text-silver">{EXAMPLE.business}</p>
        <p className="mt-2 text-sm leading-relaxed text-silver">{EXAMPLE.summary}</p>
      </div>
      <ol className="space-y-2">
        {EXAMPLE.steps.map((item, index) => {
          const shown = step === "still" || index === step;
          return (
            <li key={item.agent} className={shown ? "flex items-start gap-2" : "hidden"} aria-hidden={!shown}>
              <AgentGlyph agentId={item.agent} size="sm" working={active?.agent === item.agent} />
              <span>
                <span className="block text-sm font-medium text-card-foreground">{AGENTS[item.agent].name}</span>
                <span className="block text-sm text-silver">{item.line}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {!motion ? null : <p className="sr-only">{active?.line}</p>}
    </div>
  );
}

export function ApprovalExample() {
  return (
    <div className="rounded-2xl border border-white/10 p-4 text-left" aria-label={HERO.exampleLabel}>
      <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-300 uppercase">{HERO.exampleLabel}</p>
      <p className="mt-3 text-sm font-medium text-white">Draft for {EXAMPLE.lead}</p>
      <p className="mt-2 text-sm leading-relaxed text-silver">{EXAMPLE.draft}</p>
      <p className="mt-3 text-sm text-silver">{EXAMPLE.draftStatus}</p>
    </div>
  );
}
