"use client";

import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";

import { CheckCircle2, Download } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { api } from "../../../convex/_generated/api";

/** What the lead's page shows: the approved proposal only. */
export type ProposalPageData = NonNullable<FunctionReturnType<typeof api.proposalPage.page>>;

function fileName(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "proposal";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The proposal as the lead reads it, in the business's name. It counts one open from the browser, offers the PDF,
 * and has "Accept" with a typed name (not a signature). No Vistrial branding, no labels meant for the team.
 */
export function ProposalPublic({ proposal, onSeen, onAccept }: { proposal: ProposalPageData; onSeen: () => Promise<void>; onAccept: (name: string) => Promise<{ ok: true } | { ok: false; message: string }> }) {
  const counted = useRef(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [accepted, setAccepted] = useState<{ name: string } | null>(proposal.acceptedName ? { name: proposal.acceptedName } : null);
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    void onSeen();
  }, [onSeen]);

  async function downloadPdf() {
    const [{ pdf }, { ProposalPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./proposal-pdf")]);
    const blob = await pdf(ProposalPdf({ proposal })).toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName(proposal.title)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-10 text-foreground sm:px-6 sm:py-16">
      <article className="mx-auto grid w-full max-w-2xl min-w-0 gap-8" data-proposal-page>
        <header className="grid min-w-0 gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{proposal.business}</p>
          <h1 className="font-heading text-2xl break-words text-foreground sm:text-3xl">{proposal.title}</h1>
          <p className="text-sm text-muted-foreground">Prepared for {proposal.leadName}</p>
        </header>
        <p className="text-base break-words">{proposal.intro}</p>
        {proposal.needs.length ? (
          <Section title="What you told us">
            <ul className="grid list-disc gap-1 pl-5 text-sm">
              {proposal.needs.map((row) => (
                <li key={row} className="break-words">
                  {row}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        <section className="grid min-w-0 gap-3 rounded-xl border border-border p-4 sm:p-6">
          <h2 className="font-heading text-xl break-words">{proposal.package.title}</h2>
          {proposal.package.body ? <p className="text-sm break-words text-muted-foreground">{proposal.package.body}</p> : null}
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            {proposal.deliverables.map((row) => (
              <li key={row} className="break-words">
                {row}
              </li>
            ))}
          </ul>
          <div className="grid gap-0.5 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Investment</span>
            <span className="text-lg font-medium break-words">{proposal.price.title}</span>
            {proposal.price.body ? <span className="text-sm break-words text-muted-foreground">{proposal.price.body}</span> : null}
          </div>
        </section>
        {proposal.guarantee ? (
          <Section title="Our guarantee">
            <p className="text-sm break-words">{proposal.guarantee.title}</p>
            {proposal.guarantee.body ? <p className="text-sm break-words text-muted-foreground">{proposal.guarantee.body}</p> : null}
          </Section>
        ) : null}
        {proposal.proof.length ? (
          <Section title="Results for others">
            <ul className="grid gap-1 text-sm">
              {proposal.proof.map((row) => (
                <li key={row.title} className="break-words">
                  {row.title}
                  {row.body ? <span className="text-muted-foreground">: {row.body}</span> : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        <Section title="Next steps">
          <ol className="grid list-decimal gap-1 pl-5 text-sm">
            {proposal.nextSteps.map((row) => (
              <li key={row} className="break-words">
                {row}
              </li>
            ))}
          </ol>
          <p className="text-sm break-words">{proposal.closing}</p>
        </Section>

        <section className="grid min-w-0 gap-3 rounded-xl border border-border p-4 sm:p-6" aria-label="Your answer" data-proposal-accept>
          {accepted ? (
            <p className="flex items-start gap-2 text-sm">
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              <span className="min-w-0 break-words">
                Accepted by {accepted.name}. {proposal.business} will be in touch about the next step.
              </span>
            </p>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setProblem("");
                const result = await onAccept(name);
                setBusy(false);
                if (result.ok) setAccepted({ name: name.trim() });
                else setProblem(result.message);
              }}
            >
              <p className="text-sm">Ready to go ahead? Type your name and press Accept. This tells {proposal.business} you accept the proposal; it is not a signature, and they will follow up on the next step.</p>
              <div className="flex flex-wrap gap-2">
                <Input aria-label="Your name" placeholder="Your name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1 basis-48" />
                <Button type="submit" disabled={busy || !name.trim()}>
                  Accept
                </Button>
              </div>
              {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
            </form>
          )}
          <p className="text-xs text-muted-foreground">
            Payment: {proposal.payment === "ready" ? `${proposal.business} will send a payment link once you accept.` : `${proposal.business} will send payment details once you accept.`}
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              void downloadPdf().catch(() => setProblem("The PDF could not be made. Try again."));
            }}
          >
            <Download aria-hidden className="size-4" />
            Download PDF
          </Button>
        </div>
      </article>
    </main>
  );
}
