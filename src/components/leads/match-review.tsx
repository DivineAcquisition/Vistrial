"use client";

import { useMutation, useQuery } from "convex/react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function MatchReview() {
  const shell = useWorkspaceShell();
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  if (shell.role === "rep") {
    return (
      <p className="text-sm text-muted-foreground">An owner or manager reviews matches.</p>
    );
  }
  return <LiveMatches workspaceId={shell.workspaceId} />;
}

function LiveMatches({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const matches = useQuery(api.merges.listMatches, { workspaceId }) ?? [];
  const merges = useQuery(api.merges.listMerges, { workspaceId }) ?? [];
  const merge = useMutation(api.merges.merge);
  const dismiss = useMutation(api.merges.dismiss);
  const undo = useMutation(api.merges.undo);

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-3xl gap-6">
      <PageHeader
        eyebrow="People"
        title="Review matches"
        description="Merge two people or dismiss the pair. A dismissed row is not imported. Undo restores the earlier consent, and it is refused if that person was merged again."
      />
      <section className="grid gap-3" aria-label="Pending matches">
        <h2 className="font-heading text-base">Pending</h2>
        {matches.length === 0 ? <p className="text-sm text-muted-foreground">No matches are waiting.</p> : null}
        {matches.map(
          (match: {
            id: string;
            reason: string;
            left: { id: string; name: string } | null;
            right: { id: string; name: string } | null;
          }) => (
            <Panel key={match.id} className="grid min-w-0 gap-3 p-6 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">First person</p>
                <p className="font-medium break-words">{match.left?.name}</p>
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Second person</p>
                <p className="font-medium break-words">{match.right?.name}</p>
              </div>
              <p className="text-sm text-muted-foreground sm:col-span-2">
                {match.reason === "email_phone_split" ? "Email and phone point at two people." : "Same name."}
              </p>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button
                  type="button"
                  disabled={!match.left || !match.right}
                  onClick={() => {
                    if (!match.left || !match.right) return;
                    void merge({
                      workspaceId,
                      matchId: match.id as Id<"possibleMatches">,
                      survivorPersonId: match.left.id as Id<"people">,
                      mergedPersonId: match.right.id as Id<"people">,
                    });
                  }}
                >
                  Merge into the first person
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void dismiss({ workspaceId, matchId: match.id as Id<"possibleMatches"> })}
                >
                  Dismiss
                </Button>
              </div>
            </Panel>
          ),
        )}
      </section>
      <section className="grid gap-3" aria-label="Merges that can be undone">
        <h2 className="font-heading text-base">Recent merges</h2>
        {merges.length === 0 ? <p className="text-sm text-muted-foreground">No merges to undo.</p> : null}
        {merges.map(
          (row: {
            id: string;
            survivor: { name: string } | null;
            merged: { name: string } | null;
          }) => (
            <Panel key={row.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 p-6">
              <p className="min-w-0 text-sm break-words">
                {row.survivor?.name ?? "Unknown"} kept {row.merged?.name ?? "Unknown"}.
              </p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void undo({ workspaceId, mergeId: row.id as Id<"mergeRecords"> })}
              >
                Undo
              </Button>
            </Panel>
          ),
        )}
      </section>
    </div>
  );
}
