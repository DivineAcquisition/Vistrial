"use client";

import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { FileText, Quote, TriangleAlert } from "@/components/icons";
import { EvidenceLabel } from "@/components/readable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { showError } from "@/lib/errors/show-error";
import type { api } from "../../../convex/_generated/api";

import { SectionTitle } from "./work-shell";

/** What `api.proposals.proposal` and `api.proposals.forReview` return. */
export type ProposalData = FunctionReturnType<typeof api.proposals.proposal>;
export type ProposalForReview = FunctionReturnType<typeof api.proposals.forReview>;

export type ProposalActions = {
  /** Asks for a proposal from this review, after the budget shown is confirmed. */
  request: (confirmedCredits: number) => Promise<unknown>;
  open: (proposalId: string) => void;
};

const STATE: Record<ProposalData["state"], { words: string; badge: "success" | "warning" | "info" | "error" }> = {
  ready: { words: "Waiting for your review", badge: "info" },
  needsReview: { words: "Did not pass its checks", badge: "warning" },
  running: { words: "Being written", badge: "info" },
  failed: { words: "Could not be written", badge: "error" },
};

function stateOf(proposal: Pick<ProposalData, "state" | "approved">) {
  return proposal.state === "ready" && proposal.approved ? { words: "Approved", badge: "success" as const } : STATE[proposal.state];
}

/** On a call review: the proposal from this call, or asking for one with the budget shown first. */
export function ProposalPanel({ data, actions }: { data: ProposalForReview; actions: ProposalActions }) {
  const [busy, setBusy] = useState(false);
  const latest = data.latest;
  return (
    <section className="grid min-w-0 gap-2 rounded-lg border border-border p-3 sm:p-4" aria-label="Proposal" data-proposal-panel>
      <SectionTitle icon={FileText}>Dealmaker · proposal</SectionTitle>
      {latest ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant={stateOf(latest).badge} size="sm">
            {stateOf(latest).words}
          </Badge>
          {latest.view ? (
            <Button size="sm" variant="outline" onClick={() => actions.open(latest.id)}>
              Open the proposal
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">A proposal for this lead from what they said on this call and your Offer folder. It never sets a price, and it waits for your review before anything reaches the lead.</p>
      )}
      {data.blocked ? <p className="text-sm text-muted-foreground">{data.blocked}</p> : null}
      {data.canRequest && latest?.state !== "running" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={latest ? "outline" : "default"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await actions.request(data.maxCredits);
              } catch (error) {
                showError(error);
              }
              setBusy(false);
            }}
          >
            {latest ? "Write it again" : "Write a proposal"}
          </Button>
          <span className="text-xs text-muted-foreground">Up to {data.maxCredits} credits. Nothing runs until you press it.</span>
        </div>
      ) : null}
    </section>
  );
}

/** One proposal, drawn from its saved view. The package, price, guarantee and proof are the Offer folder's own words. */
function day(at: number) {
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const PAYMENT_WORDS: Record<ProposalData["payment"], string> = {
  notSetUp: "Payment link: Not set up yet. Stripe is not configured on Vistrial, so send payment details yourself.",
  ready: "Payment link: Stripe is configured on Vistrial. Links from a proposal come in a later step; send one from Stripe for now.",
};

/** Sharing an approved proposal: its page's link, the email in Comms, and what the lead did with it. */
function SharePanel({ proposal, onShare }: { proposal: ProposalData; onShare?: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const share = proposal.share;
  return (
    <section className="grid min-w-0 gap-2 rounded-lg border border-border p-3 sm:p-4" aria-label="Sharing" data-proposal-share>
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">With {proposal.leadName}</h3>
      {share ? (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 basis-56 truncate rounded-md bg-muted px-2 py-1 text-xs">{share.url}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(share.url);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <p className="text-sm text-foreground">
            {share.drafted ? "The email with this link waits in Comms for a person to approve and send it." : "No CRM contact is linked, so copy the link and send it yourself."}
          </p>
          <p className="text-sm text-foreground">
            {share.firstViewedAt ? `Opened ${share.views} time${share.views === 1 ? "" : "s"}, first on ${day(share.firstViewedAt)}.` : share.nudged ? "Not opened in 3 days. A follow-up waits in Comms." : "Not opened yet."}
          </p>
          {share.acceptedAt ? (
            <p className="text-sm text-foreground">
              Accepted by {share.acceptedName} on {day(share.acceptedAt)}. {share.wonStep?.detail ?? "Mark the deal won in your CRM when you are ready."}
            </p>
          ) : null}
        </>
      ) : onShare ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onShare();
              } catch (error) {
                showError(error);
              }
              setBusy(false);
            }}
          >
            Share with {proposal.leadName}
          </Button>
          <span className="text-xs text-muted-foreground">{proposal.hasLead ? "Makes the page's link and drafts the email in Comms. Nothing is sent until a person approves it." : "Makes the page's link for you to send."}</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not shared yet.</p>
      )}
      <p className="text-xs text-muted-foreground">{PAYMENT_WORDS[proposal.payment]}</p>
    </section>
  );
}

export function ProposalView({ proposal, onClose, onShare }: { proposal: ProposalData; onClose?: () => void; onShare?: () => Promise<unknown> }) {
  const view = proposal.view;
  const look = stateOf(proposal);
  return (
    <Panel className="grid min-w-0 gap-5 p-4 sm:p-6" data-proposal={proposal.id}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1">
          <p className="text-xs font-medium text-muted-foreground">Dealmaker · proposal</p>
          <h2 className="font-heading text-lg break-words text-foreground">{view?.title ?? proposal.leadName}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={look.badge} size="sm">
            {look.words}
          </Badge>
          {onClose ? (
            <Button size="sm" variant="ghost" onClick={onClose}>
              Back to calls
            </Button>
          ) : null}
        </div>
      </div>
      {!view ? (
        <p className="text-sm text-muted-foreground">{proposal.state === "running" ? "Dealmaker is writing this proposal." : "This proposal could not be written. Nothing reaches the lead."}</p>
      ) : (
        <>
          {!view.checksPassed ? (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/8 p-3 text-sm text-foreground">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              This proposal did not pass every check. It cannot be sent; read why in Approvals.
            </p>
          ) : !proposal.approved ? (
            <p className="text-sm text-muted-foreground">It waits for your review in Approvals. Nothing reaches {proposal.leadName} until a person approves it and sends it.</p>
          ) : (
            <SharePanel proposal={proposal} onShare={proposal.canRequest ? onShare : undefined} />
          )}
          <p className="text-sm break-words text-foreground">{view.intro}</p>
          <section className="grid gap-2" aria-label="What they told you">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">What {proposal.leadName} told you</h3>
            <ul className="grid gap-2">
              {view.needs.map((row) => (
                <li key={row.quote} className="grid min-w-0 gap-0.5 text-sm">
                  <span className="text-foreground">{row.need}</span>
                  <span className="flex min-w-0 gap-1.5 text-xs text-muted-foreground">
                    <Quote aria-hidden className="mt-0.5 size-3 shrink-0" />
                    <span className="min-w-0 break-words">
                      “{row.quote}” · {row.kind}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="grid gap-2 rounded-lg border border-border p-3 sm:p-4" aria-label="The package">
            <h3 className="font-heading text-base text-foreground">{view.package.title}</h3>
            {view.package.body ? <p className="text-sm break-words text-muted-foreground">{view.package.body}</p> : null}
            <ul className="grid list-disc gap-1 pl-5 text-sm text-foreground">
              {view.deliverables.map((row) => (
                <li key={row} className="break-words">
                  {row}
                </li>
              ))}
            </ul>
            <div className="grid gap-0.5 border-t border-border pt-2">
              <span className="text-xs text-muted-foreground">Investment, as your Offer folder states it</span>
              <span className="text-sm font-medium break-words text-foreground">{view.price.title}</span>
              {view.price.body ? <span className="text-xs break-words text-muted-foreground">{view.price.body}</span> : null}
            </div>
            {view.guarantee ? <p className="text-sm break-words text-foreground">Guarantee: {view.guarantee.title}</p> : null}
          </section>
          {view.proof.length ? (
            <section className="grid gap-1.5" aria-label="Results for others">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Results for others, from your Offer folder</h3>
              <ul className="grid gap-1 text-sm text-foreground">
                {view.proof.map((row) => (
                  <li key={row.itemId} className="break-words">
                    {row.title}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="grid gap-1.5" aria-label="Next steps">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Next steps</h3>
            <ol className="grid list-decimal gap-1 pl-5 text-sm text-foreground">
              {view.nextSteps.map((row) => (
                <li key={row} className="break-words">
                  {row}
                </li>
              ))}
            </ol>
            <p className="text-sm break-words text-foreground">{view.closing}</p>
          </section>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <EvidenceLabel label="Inference" />
            <span>The wording is Dealmaker&apos;s; the quotes, package, price and proof are your data.</span>
          </div>
          {view.missing.length ? (
            <ul className="grid gap-1 text-xs text-muted-foreground" aria-label="What this proposal could not use">
              {view.missing.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Panel>
  );
}
