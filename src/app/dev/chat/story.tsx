"use client";

import { useState } from "react";

import { VistrialMark } from "@/components/brand/vistrial-mark";
import { ChatComposer, type ComposerFile, type ComposerMode } from "@/components/chat/chat-composer";
import { SAMPLE_MARKS, SAMPLE_MODELS, SAMPLE_MODELS_CLAUDE } from "@/components/models/sample";
import { FollowUpsView, type FollowUpMessage } from "@/components/sessions/session-thread";

const AGENTS = [
  { slug: "growth-architect", name: "Strategist", live: true },
  { slug: "sales-conversion", name: "Dealmaker", live: false },
  { slug: "customer-success", name: "Customer Success", live: false },
];

const MESSAGES: FollowUpMessage[] = [
  { id: "q1", role: "you", kind: "question", text: "Which competitor promises the deposit back?", status: "done", costCents: 0 },
  {
    id: "a1",
    role: "agent",
    kind: "answer",
    text: "Housekeep is the only one that promises it in writing: a free re-clean, and a refund if the landlord still keeps part of the deposit.",
    status: "done",
    data: { cited: [{ id: "s1", title: "Housekeep end of tenancy cleaning", url: "https://housekeep.com/end-of-tenancy", platform: "web" }] },
    costCents: 3,
    model: SAMPLE_MARKS.sol,
  },
  { id: "q2", role: "you", kind: "question", text: "Who is cheapest for a two-bed flat?", status: "done", costCents: 0 },
  { id: "a2", role: "agent", kind: "answer", text: "This session only has Housekeep's price (from £200), so I can't compare yet.", status: "done", data: { cited: [] }, costCents: 2, model: SAMPLE_MARKS.sol },
  {
    id: "p2",
    role: "agent",
    kind: "proposal",
    text: "To compare two-bed prices I'd check each competitor's pricing page.",
    status: "proposed",
    data: { searches: ["Tenanclean two bed end of tenancy price", "Fantastic Services end of tenancy price London"], low: 30, high: 90 },
    costCents: 0,
  },
];

export function ChatStory() {
  const [agent, setAgent] = useState("growth-architect");
  const [mode, setMode] = useState<ComposerMode>("thorough");
  const [family, setFamily] = useState("openai/gpt-6.1-sol");
  const [sources, setSources] = useState<string[] | null>(null);
  const [links, setLinks] = useState<string[]>(["https://housekeep.com/"]);
  const [files, setFiles] = useState<ComposerFile[]>([
    { key: "f1", name: "meta-results.csv", kind: "csv", status: "read" },
    { key: "f2", name: "competitor-flyer.png", kind: "image", status: "reading" },
  ]);
  return (
    <main className="mx-auto grid min-h-screen max-w-3xl gap-10 bg-background px-4 py-10">
      <section className="grid gap-4">
        <div className="flex items-center gap-3">
          <VistrialMark />
          <h1 className="text-2xl font-semibold text-foreground">What should Vistrial work on?</h1>
        </div>
        <ChatComposer
          size="hero"
          placeholder="Ask anything about your market, competitors or customers…"
          agent={{ value: agent, options: AGENTS, onChange: setAgent }}
          mode={{ value: mode, onChange: setMode }}
          sources={{ value: sources, onChange: setSources }}
          links={{ value: links, onAdd: (url) => setLinks((rows) => [...rows, url]), onRemove: (url) => setLinks((rows) => rows.filter((row) => row !== url)) }}
          files={{ value: files, onAdd: () => undefined, onRemove: (key) => setFiles((rows) => rows.filter((row) => row.key !== key)) }}
          connect={{ canConnect: true, metaConnected: false, onConnectMeta: () => undefined }}
          onSubmit={async () => undefined}
          model={{ options: SAMPLE_MODELS_CLAUDE, value: "claude-opus-5-5" }}
          footnote="It asks only what it needs, then shows a plan with its budget. Nothing runs or spends until you press Start."
        />
      </section>
      <section className="grid gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">Follow-ups after a report</h2>
        <FollowUpsView messages={MESSAGES} agentName="Strategist" editor onRun={() => undefined} onDecline={() => undefined} />
        <ChatComposer
          placeholder="Ask about this report, or ask for more research…"
          mode={{ value: mode, onChange: setMode }}
          model={{ options: SAMPLE_MODELS, value: family, onChange: setFamily }}
          files={{ value: [], onAdd: () => undefined, onRemove: () => undefined }}
          connect={{ canConnect: true, metaConnected: true, onConnectMeta: () => undefined }}
          onSubmit={async () => undefined}
          footnote="Answers come from this session's sources. New research is proposed first, with an estimate, and runs only when you tap Run."
        />
      </section>
    </main>
  );
}
