"use client";

import { useState } from "react";

import { ConnectionLogo } from "@/components/connections/connection-logo";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

export type ClaimChoice = { id: string; name: string };

/**
 * A HighLevel install that began on HighLevel's marketplace comes back with no workspace. This asks the
 * signed-in Owner where it belongs: the organization itself or one of its clients. `pending` is null when
 * the install's code is unknown or more than an hour old.
 */
export function HighLevelClaimView({
  pending,
  workspaceName,
  choices,
  claim,
}: {
  pending: { accountName: string; canClaim: boolean } | null | undefined;
  workspaceName: string;
  /** The organization first ("own"), then each client. */
  choices: ClaimChoice[];
  claim: (choiceId: string) => Promise<string | null>;
}) {
  const [picked, setPicked] = useState(choices[0]?.id ?? "own");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (pending === undefined) return <p className="text-sm text-muted-foreground">Loading the HighLevel install.</p>;
  if (pending === null) {
    return (
      <Panel className="grid gap-2 p-4 sm:p-6">
        <p className="font-medium text-card-foreground">That HighLevel install has expired</p>
        <p className="text-sm text-muted-foreground">An install from HighLevel waits here for an hour. Press Connect HighLevel below to start again from Vistrial.</p>
      </Panel>
    );
  }

  return (
    <Panel as="section" className="grid gap-4 border-primary/30 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <ConnectionLogo id="highlevel" size={40} className="rounded-xl" />
        <div className="grid min-w-0 gap-1">
          <p className="font-heading text-lg text-card-foreground">Finish connecting {pending.accountName}</p>
          <p className="text-sm text-muted-foreground">
            You installed Vistrial from HighLevel. Choose who in {workspaceName} this sub-account belongs to. Vistrial starts reading it as soon as you connect.
          </p>
        </div>
      </div>
      {pending.canClaim ? (
        <>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium text-card-foreground">This sub-account is for</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {choices.map((choice) => (
                <label
                  key={choice.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                    picked === choice.id ? "border-primary/50 bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <input type="radio" name="highlevel-owner" value={choice.id} checked={picked === choice.id} onChange={() => setPicked(choice.id)} className="accent-primary" />
                  {choice.name}
                </label>
              ))}
            </div>
          </fieldset>
          {problem ? (
            <p role="alert" className="text-sm text-warning">
              {problem}
            </p>
          ) : null}
          <div>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setProblem(null);
                const failed = await claim(picked);
                if (failed) {
                  setProblem(failed);
                  setBusy(false);
                }
              }}
            >
              {busy ? "Connecting" : "Connect HighLevel"}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Only an Owner of {workspaceName} can connect HighLevel. Ask an Owner to open this link while signed in.</p>
      )}
    </Panel>
  );
}
