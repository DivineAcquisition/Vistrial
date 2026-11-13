"use client";

import { useState } from "react";

import { ChatComposer, type ComposerMode } from "@/components/chat/chat-composer";
import { ModelMark } from "@/components/models/model-mark";
import { ModelSwitch, type ModelOption } from "@/components/models/model-switch";
import { SAMPLE_MARKS, SAMPLE_MODELS, SAMPLE_MODELS_CLAUDE } from "@/components/models/sample";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

function Row({ title, note, options, start = "claude-opus-5-5", locked = false }: { title: string; note: string; options: ModelOption[]; start?: string; locked?: boolean }) {
  const [value, setValue] = useState(start);
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
function MenuCard({ title, options, value }: { title: string; options: ModelOption[]; value: string }) {
  const families = [...new Set(options.map((row) => row.family))];
  return (
    <Panel className="grid content-start gap-3 p-4">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {families.map((family) => {
        const rows = options.filter((row) => row.family === family);
        return (
          <div key={family} className="grid gap-1.5">
            <ModelMark model={{ family, name: rows[0].familyName }} className="text-xs font-medium text-muted-foreground" />
            <ul className="grid gap-1.5 pl-5">
              {rows.map((row) => (
                <li key={row.id}>
                  <p className="text-sm text-card-foreground">
                    {row.name}
                    {row.id === value ? <span className="text-xs text-muted-foreground"> · chosen</span> : null}
                  </p>
                  {row.cost ? <p className="text-xs text-muted-foreground">{row.cost}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground opacity-60">More models coming soon</p>
    </Panel>
  );
}

export function ModelsStory() {
  const [mode, setMode] = useState<ComposerMode>("thorough");
  const [family, setFamily] = useState("openai/gpt-6-astra");
  return (
    <main className="mx-auto grid min-h-screen max-w-3xl content-start gap-8 bg-background px-4 py-10">
      <header className="grid gap-1">
        <h1 className="font-heading text-2xl text-foreground">Choosing a model, and seeing which one ran</h1>
        <p className="text-sm text-muted-foreground">Sample data. Models are grouped under their maker&apos;s mark. Only models that can do the work are listed, and the last choice is remembered for next time.</p>
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
          <Row title="Writing an ad set" note="Every model that is switched on can do this." options={SAMPLE_MODELS} start="google/gemini-4-carbon" />
          <Row title="Researching a market" note="Research searches the web. Only models proven to do that here are listed." options={SAMPLE_MODELS_CLAUDE} />
          <Row title="Before GPT and Gemini are switched on" note="What the switch shows on a deployment with no OpenRouter key." options={SAMPLE_MODELS_CLAUDE} start="claude-sonnet-5-5" />
          <Row title="After the work has started" note="The switch only shows what it ran on." options={SAMPLE_MODELS} start="openai/gpt-6.1-sol" locked />
        </Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          <MenuCard title="Open, for writing" options={SAMPLE_MODELS} value="openai/gpt-6-astra" />
          <MenuCard title="Open, for research, and before GPT and Gemini are switched on" options={SAMPLE_MODELS_CLAUDE} value="claude-opus-5-5" />
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
