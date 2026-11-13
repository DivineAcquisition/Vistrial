"use client";

import { Plus, WifiOff } from "@/components/icons";
import { useState } from "react";

import { PlannedAgentView } from "@/components/agents/planned-agent";
import { PageEnter } from "@/components/motion/page-enter";
import { HoverLift } from "@/components/motion/hover-lift";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

const TAGS: { label: string; tone: "brand" | "neutral" | "good" | "warning" | "critical" }[] = [
  { label: "Completed", tone: "good" },
  { label: "Running", tone: "brand" },
  { label: "Waiting for you", tone: "warning" },
  { label: "Coming soon", tone: "neutral" },
  { label: "Failed", tone: "critical" },
  { label: "Connected", tone: "good" },
  { label: "Not connected", tone: "neutral" },
  { label: "Live", tone: "brand" },
];

const action = (
  <Button>
    <Plus aria-hidden /> Start a session
  </Button>
);

export function VisualsStory({ part }: { part: string }) {
  const show = (name: string) => part === "all" || part === name;
  const [joined, setJoined] = useState(false);
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl gap-12 bg-background px-4 py-10">
      <PageEnter id={part}>
        <div className="grid gap-12">
          {show("planned") ? (
            <section className="grid gap-6">
              <PlannedAgentView slug="sales-conversion" name="Dealmaker" job="Will help turn leads into customers: follow-ups, calls and pipeline." joined={joined} onToggle={() => setJoined(!joined)} />
              <PlannedAgentView slug="retention" name="Keeper" job="Will spot risk early and suggest plays to keep customers." joined onToggle={() => undefined} />
            </section>
          ) : null}

          {show("header") ? (
            <section className="grid gap-3">
              <PageHeader
                eyebrow="Today"
                title="Decisions"
                description="Assets wait here until a person approves them. Nothing is posted on its own."
                actions={action}
              />
              <PageHeader eyebrow="Owner" title="Controls" description="Spend caps, approvals and what each agent may do." />
            </section>
          ) : null}

          {show("tags") ? (
            <section className="grid gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">Status tags</h2>
              <div className="flex flex-wrap gap-2">
                {TAGS.map((tag) => (
                  <StatusBadge key={tag.label} label={tag.label} tone={tag.tone} className="[&_span]:normal-case" />
                ))}
              </div>
            </section>
          ) : null}

          {show("banners") ? (
            <section className="grid gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">Banners</h2>
              <Banner
                tone="warning"
                title="Waiting for your answer"
                action={
                  <Button size="sm" variant="outline">
                    Answer
                  </Button>
                }
              >
                It asked a question above. Nothing runs or spends until you answer.
              </Banner>
              <Banner tone="brand" title="Working on it" action={<Button size="sm" variant="outline">Stop</Button>}>
                It asks you if it needs anything, and spends nothing while it waits.
              </Banner>
              <Banner tone="warning" role="alert" icon={<WifiOff aria-hidden />} title="Reconnecting">
                This page may be out of date until the connection returns.
              </Banner>
              <Banner compact tone="good" title="Connected to Bay Area Cleaning Professionals. Reading ads only." />
            </section>
          ) : null}

          {show("empty") ? (
            <section className="grid gap-6">
              <h2 className="text-sm font-medium text-muted-foreground">Empty pages</h2>
              <EmptyState preview="rows" title="Decisions waiting on you will appear here." detail="Reports wait for your approval and questions wait for your answer. Nothing is posted or spent on its own." action={action} />
              <EmptyState preview="cards" title="Your research sessions will appear here." detail="Each session studies your market, cites its sources and ends in a report you approve." action={action} />
              <EmptyState preview="facts" title="What Vistrial learns about your business will appear here." detail="Facts appear as you answer questions in sessions and confirm your profile." action={action} />
              <EmptyState preview="board" title="Sources appear here as the agent finds them." />
            </section>
          ) : null}

          {show("motion") ? (
            <section className="grid gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">Staggered cards with hover lift</h2>
              <Stagger as="div" className="grid gap-3 sm:grid-cols-3">
                {["Austin deep cleaning", "Bay Area offers", "Move-out pricing"].map((title) => (
                  <StaggerItem as="div" key={title}>
                    <HoverLift>
                      <div className="grid gap-2 rounded-xl border border-border bg-card p-4">
                        <StatusBadge label="Completed" tone="good" />
                        <span className="font-medium text-card-foreground">{title}</span>
                        <span className="text-sm text-muted-foreground">Find the offers competitors lead with.</span>
                      </div>
                    </HoverLift>
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          ) : null}
        </div>
      </PageEnter>
    </main>
  );
}
