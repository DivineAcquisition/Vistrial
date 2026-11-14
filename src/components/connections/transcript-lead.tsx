"use client";

import { useMutation, useQuery } from "convex/react";
import { useId, useState } from "react";

import type { TranscriptRow } from "@/components/connections/transcripts-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showError } from "@/lib/errors/show-error";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Choice = { contactRef: string; dealRef: string | null; name: string; source: string | null };

/**
 * Links a call to the CRM lead it was with, so Dealmaker can read it with that lead's deal. A person chooses:
 * leads with a booked call on the call's date are suggested first, any other lead can be searched by name or
 * email. Nothing is linked on its own. The choices are read only while the picker is open.
 */
export function TranscriptLead({ workspaceId, row }: { workspaceId: Id<"workspaces">; row: TranscriptRow }) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const link = useMutation(api.transcripts.linkLead);
  const choices = useQuery(api.transcripts.leadChoices, open ? { workspaceId, transcriptId: row.id as Id<"callTranscripts">, q: q.trim() || undefined } : "skip");

  const choose = async (choice: Choice | null) => {
    setBusy(true);
    try {
      await link({
        workspaceId,
        transcriptId: row.id as Id<"callTranscripts">,
        contactRef: choice ? choice.contactRef : null,
        ...(choice?.dealRef ? { dealRef: choice.dealRef } : {}),
      });
      setOpen(false);
      setQ("");
    } catch (problem) {
      showError(problem);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {row.lead ? "Change the lead" : "Link to a lead"}
        </Button>
        {row.lead ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void choose(null)}>
            Unlink
          </Button>
        ) : null}
      </div>
    );
  }

  const option = (choice: Choice) => (
    <li key={choice.contactRef}>
      <Button type="button" variant="ghost" size="sm" className="h-auto w-full justify-start py-1.5 text-left" disabled={busy} onClick={() => void choose(choice)}>
        <span className="grid">
          <span>{choice.name}</span>
          {choice.source ? <span className="text-xs text-muted-foreground">From {choice.source}</span> : null}
        </span>
      </Button>
    </li>
  );

  return (
    <div className="grid gap-2 rounded-xl border border-border p-3">
      {choices === undefined ? (
        <p className="text-muted-foreground">Reading your CRM.</p>
      ) : choices.crm === null ? (
        <p className="text-muted-foreground">Connect a CRM for this client to link the call to a lead.</p>
      ) : (
        <>
          {choices.suggested.length > 0 ? (
            <div className="grid gap-1">
              <p className="text-xs text-muted-foreground">Booked a call in {choices.crm} around this date</p>
              <ul className="grid gap-0.5">{choices.suggested.map(option)}</ul>
            </div>
          ) : null}
          <label htmlFor={`${ids}-q`} className="text-xs text-muted-foreground">
            Find a lead in {choices.crm} by name or email
          </label>
          <Input id={`${ids}-q`} value={q} maxLength={80} placeholder="Jordan" onChange={(event) => setQ(event.target.value)} />
          {q.trim().length >= 2 ? (
            choices.matches.length > 0 ? (
              <ul className="grid gap-0.5">{choices.matches.map(option)}</ul>
            ) : (
              <p className="text-muted-foreground">No lead matches.</p>
            )
          ) : null}
        </>
      )}
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
