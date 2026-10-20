"use client";

import { useState, useTransition } from "react";

import { setOutcomeMetricsAction } from "@/app/(workspace)/app/home/workspace-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/** Owners pick up to four numbers for Home, from the allowed list only. */
export function OutcomePicker({ choices, selected }: { choices: Array<{ id: string; label: string }>; selected: string[] }) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(id: string, on: boolean) {
    setNote(null);
    setPicked((current) => (on ? [...current, id].slice(0, 4) : current.filter((item) => item !== id)));
  }

  return (
    <section id="home-numbers" aria-labelledby="home-numbers-title" className="flex flex-col gap-3 scroll-mt-24">
      <div>
        <h2 id="home-numbers-title" className="font-heading text-base text-card-foreground">
          Home numbers
        </h2>
        <p className="text-sm text-muted-foreground">Pick up to four. A number your workspace does not track yet stays hidden on Home.</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {choices.map((choice) => {
          const checked = picked.includes(choice.id);
          return (
            <li key={choice.id} className="flex items-center gap-2">
              <Checkbox
                id={`metric-${choice.id}`}
                checked={checked}
                disabled={!checked && picked.length >= 4}
                onCheckedChange={(on) => toggle(choice.id, on === true)}
              />
              <Label htmlFor={`metric-${choice.id}`}>{choice.label}</Label>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          loading={pending}
          disabled={!picked.length}
          onClick={() =>
            start(async () => {
              const result = await setOutcomeMetricsAction(picked);
              setNote(result.ok ? "Saved. Home shows these numbers now." : result.error);
            })
          }
        >
          Save
        </Button>
        {note ? (
          <p role="status" className="text-sm text-muted-foreground">
            {note}
          </p>
        ) : null}
      </div>
    </section>
  );
}
