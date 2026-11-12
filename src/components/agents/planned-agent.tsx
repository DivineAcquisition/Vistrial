"use client";

import { AgentAvatar } from "@/components/live/agent-avatar";
import { useMutation, useQuery } from "convex/react";
import { Bell, BellRing, Globe } from "@/components/icons";
import { useState } from "react";

import { AgentScene } from "@/components/agents/agent-scene";
import { PlatformLogo } from "@/components/marketing/platform-logo";
import { HoverLift } from "@/components/motion/hover-lift";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { Button } from "@/components/ui/button";
import { GhostPreview } from "@/components/ui/empty-state";
import { PLANNED_AGENTS, PLANNED_FALLBACK } from "@/lib/agents/planned";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** A coming-soon agent as data, so stories can show it without a backend. */
export function PlannedAgentView({
  slug,
  name,
  job,
  joined,
  onToggle,
}: {
  slug: string;
  name: string;
  job: string;
  joined: boolean | null;
  onToggle: () => void;
}) {
  const plan = PLANNED_AGENTS[slug] ?? PLANNED_FALLBACK;
  const orbit = plan.integrations.map((row) => ({ key: row.id ?? row.label, logo: row.id, label: row.label }));
  return (
    <section
      aria-label={`${name}, coming soon`}
      className="relative isolate grid gap-8 overflow-hidden rounded-3xl border border-overlay/[0.08] bg-card px-5 py-8 sm:px-8"
      style={{ "--agent": plan.tint } as React.CSSProperties}
    >
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--agent)_18%,transparent),transparent)]" />
      <div className="grid justify-items-center gap-3 text-center">
        <AgentScene tint={plan.tint} sources={orbit} label="Coming soon" />
        <AgentAvatar slug={slug} size="lg" />
        <h2 className="font-heading text-2xl text-foreground">{name}</h2>
        <p className="max-w-xl text-sm text-muted-foreground">{job}</p>
      </div>

      <Stagger as="div" className="grid gap-3 md:grid-cols-3">
        {plan.capabilities.map((capability) => (
          <StaggerItem as="div" key={capability.title}>
            <HoverLift>
              <div className="grid gap-3 rounded-2xl border border-border bg-background/70 p-4">
                <div className="h-28 overflow-hidden rounded-xl border border-overlay/[0.06] bg-card/60 p-2">
                  <GhostPreview preview={capability.preview === "board" ? "cards" : capability.preview} className="scale-[0.8] origin-top-left [width:125%]" />
                </div>
                <div className="grid gap-1">
                  <p className="font-medium text-card-foreground">{capability.title}</p>
                  <p className="text-sm text-muted-foreground">{capability.detail}</p>
                </div>
              </div>
            </HoverLift>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="grid justify-items-center gap-3">
        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Will work with</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {plan.integrations.map((row) => (
            <li key={row.label} className="inline-flex items-center gap-2 rounded-[8px] border border-border bg-background px-2.5 py-1.5 text-sm text-card-foreground shadow-sm">
              {row.id ? <PlatformLogo id={row.id} size={16} decorative /> : <Globe aria-hidden className="size-4 text-muted-foreground" />}
              {row.label}
            </li>
          ))}
        </ul>
        <Button variant={joined ? "outline" : "default"} disabled={joined === null} onClick={onToggle} className="mt-2">
          {joined ? <BellRing aria-hidden /> : <Bell aria-hidden />}
          {joined ? "We'll tell you when it's live" : "Notify me when it's live"}
        </Button>
      </div>
    </section>
  );
}

/** The live version: remembers each person's "notify me" for this workspace. */
export function PlannedAgent({ workspaceId, slug, name, job }: { workspaceId: Id<"workspaces">; slug: string; name: string; job: string }) {
  const mine = useQuery(api.agentWaitlist.mine, { workspaceId, agentSlug: slug });
  const toggle = useMutation(api.agentWaitlist.toggle);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const joined = optimistic ?? mine?.joined ?? null;
  return (
    <PlannedAgentView
      slug={slug}
      name={name}
      job={job}
      joined={joined}
      onToggle={() => {
        setOptimistic(!joined);
        void toggle({ workspaceId, agentSlug: slug })
          .then((result) => setOptimistic(result.joined))
          .catch(() => setOptimistic(null));
      }}
    />
  );
}
