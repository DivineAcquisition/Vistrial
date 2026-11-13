"use client";

import { useState } from "react";

import { ChatComposer, type ComposerMode } from "@/components/chat/chat-composer";
import { ModelMark, type ModelFamily } from "@/components/models/model-mark";
import { ModelSwitch, type ModelOption } from "@/components/models/model-switch";
import { SAMPLE_MARKS, SAMPLE_MODELS, SAMPLE_MODELS_OFF, SAMPLE_MODELS_RESEARCH } from "@/components/models/sample";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

function Row({ title, note, options, start = "claude", locked = false }: { title: string; note: string; options: ModelOption[]; start?: ModelFamily; locked?: boolean }) {
  const [value, setValue] = useState<ModelFamily>(start);
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid gap-0.5">
        <p className="text-sm font-medium text-card-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      <ModelSwitch options={options} value={value} onChange={setValue} locked={locked} align="end" />
    </div>
  );
}

/** What the open menu shows, drawn flat so a screenshot can hold every line of it. */
function MenuCard({ title, options, value }: { title: string; options: ModelOption[]; value: ModelFamily }) {
  return (
    <Panel className="grid content-start gap-2 p-4">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="grid gap-2">
        {options.map((row) => (
          <li key={row.family} className={row.off ? "opacity-60" : undefined}>
            <ModelMark model={{ family: row.family, name: row.thorough }} className="text-sm text-card-foreground" />
            <p className="pl-5 text-xs text-muted-foreground">{row.off ?? row.cost ?? (row.family === value ? "What work starts on today" : "")}</p>
          </li>
        ))}
        <li className="text-xs text-muted-foreground opacity-60">More models coming soon</li>
      </ul>
    </Panel>
  );
}

export function ModelsStory() {
  const [mode, setMode] = useState<ComposerMode>("thorough");
  const [family, setFamily] = useState<ModelFamily>("gpt");
  return (
    <main className="mx-auto grid min-h-screen max-w-3xl content-start gap-8 bg-background px-4 py-10">
      <header className="grid gap-1">
        <h1 className="font-heading text-2xl text-foreground">Choosing a model, and seeing which one ran</h1>
        <p className="text-sm text-muted-foreground">Sample data. Three families, each with its maker&apos;s mark and the model&apos;s plain name.</p>
      </header>

      <section className="grid gap-3" aria-label="The switch in the chat box">
        <h2 className="text-sm font-medium text-muted-foreground">In the chat box</h2>
        <ChatComposer
          size="hero"
          placeholder="Ask about your market, your offer or your growth…"
          mode={{ value: mode, onChange: setMode }}
          model={{ options: SAMPLE_MODELS, value: family, onChange: setFamily }}
          links={{ value: [], onAdd: () => undefined, onRemove: () => undefined }}
          onSubmit={async () => undefined}
          footnote="It asks only what it needs, then shows a plan with its budget. Nothing runs or spends until you press Start."
        />
      </section>

      <section className="grid gap-3" aria-label="The switch in its states">
        <h2 className="text-sm font-medium text-muted-foreground">The switch</h2>
        <Panel className="grid gap-4 p-4 sm:p-6">
          <Row title="Writing an ad set" note="Every model that is switched on can do this." options={SAMPLE_MODELS} start="gemini" />
          <Row title="Researching a market" note="Research searches the web. A model that cannot do that here is shown, greyed, with the reason." options={SAMPLE_MODELS_RESEARCH} />
          <Row title="Before GPT and Gemini are switched on" note="What the switch shows on a deployment with no OpenRouter key." options={SAMPLE_MODELS_OFF} />
          <Row title="After the work has started" note="The switch only shows what it ran on." options={SAMPLE_MODELS} start="gpt" locked />
        </Panel>
        <div className="grid gap-3 sm:grid-cols-3">
          <MenuCard title="Open, for writing" options={SAMPLE_MODELS} value="claude" />
          <MenuCard title="Open, for research" options={SAMPLE_MODELS_RESEARCH} value="claude" />
          <MenuCard title="Open, before switching on" options={SAMPLE_MODELS_OFF} value="claude" />
        </div>
      </section>

      <section className="grid gap-3" aria-label="Starting other work">
        <h2 className="text-sm font-medium text-muted-foreground">Where work starts outside a chat</h2>
        <Panel className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Write the ad set</Button>
            <ModelSwitch options={SAMPLE_MODELS} value={family} onChange={setFamily} />
          </div>
        </Panel>
      </section>

      <section className="grid gap-3" aria-label="The mark on finished work">
        <h2 className="text-sm font-medium text-muted-foreground">On finished work</h2>
        <Panel className="grid gap-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-card-foreground">Offer analysis: Lead generation retainer</p>
            <ModelMark model={SAMPLE_MARKS.sol} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-card-foreground">Coaching programs: market report</p>
            <ModelMark model={SAMPLE_MARKS.opus} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-card-foreground">Aster Coaching: ad set from an offer</p>
            <ModelMark model={SAMPLE_MARKS.carbon} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-card-foreground">A report from before models were recorded</p>
            <span className="text-xs text-muted-foreground">(shows no mark)</span>
          </div>
        </Panel>
      </section>
    </main>
  );
}
