"use client";

import { forwardRef, useState } from "react";

import { Check, ShieldCheck, Users, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";

import type { OfferComparison, OfferVersion } from "./types";

export type OfferContent = { name: string; price: string; included: string[]; guarantee: string; terms: string; targetCustomer: string };

const ORIGIN_WORDS: Record<OfferVersion["origin"], string> = { person: "You edited", chat: "From your chat", analysis: "From an offer analysis" };

function Missing() {
  return <span className="text-muted-foreground italic">Not stated</span>;
}

/**
 * The offer card: a premium, printable summary of one offer. Its own colours come from the theme tokens,
 * so it reads in light and dark and exports as it looks.
 */
export const OfferCardView = forwardRef<HTMLDivElement, { offer: OfferContent; version?: number; origin?: OfferVersion["origin"]; at?: number; className?: string }>(function OfferCardView(
  { offer, version, origin, at, className },
  ref,
) {
  return (
    <div ref={ref} className={cn("relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/60 via-primary/20 to-primary/50 p-px", className)}>
      <div className="relative grid gap-5 rounded-[calc(1.5rem-1px)] bg-card p-5 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Offer</p>
            <h3 className="font-heading text-xl break-words text-card-foreground sm:text-2xl">{offer.name || <Missing />}</h3>
          </div>
          <div className="grid justify-items-end">
            <span className="font-heading text-2xl text-card-foreground tabular-nums sm:text-3xl">{offer.price || <Missing />}</span>
            {version ? (
              <span className="text-[11px] text-muted-foreground">
                Version {version}
                {at ? ` · ${shortDate(at)}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        <div className="relative grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">What&apos;s included</p>
          {offer.included.length ? (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {offer.included.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-card-foreground">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check aria-hidden className="size-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">
              <Missing />
            </p>
          )}
        </div>
        <div className="relative grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1 rounded-2xl border border-border bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck aria-hidden className="size-3.5 text-primary" /> Guarantee
            </p>
            <p className="text-sm text-card-foreground">{offer.guarantee || <Missing />}</p>
          </div>
          <div className="grid gap-1 rounded-2xl border border-border bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users aria-hidden className="size-3.5 text-primary" /> For
            </p>
            <p className="text-sm text-card-foreground">{offer.targetCustomer || <Missing />}</p>
          </div>
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
          <span className="text-muted-foreground">
            <span className="font-medium text-card-foreground">Terms:</span> {offer.terms || "Not stated"}
          </span>
          {origin ? <span className="text-muted-foreground">{ORIGIN_WORDS[origin]}</span> : null}
        </div>
      </div>
    </div>
  );
});

/** Edits a card. Saving makes a new version; nothing is overwritten. */
export function OfferEditor({ initial, onSave, onCancel }: { initial: OfferContent; onSave: (offer: OfferContent, note: string) => Promise<void>; onCancel: () => void }) {
  const [offer, setOffer] = useState<OfferContent>(initial);
  const [items, setItems] = useState(initial.included.join("\n"));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const field = (key: keyof Omit<OfferContent, "included">, label: string, multiline = false) => (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {multiline ? (
        <Textarea rows={2} value={offer[key]} onChange={(event) => setOffer({ ...offer, [key]: event.target.value })} />
      ) : (
        <Input value={offer[key]} onChange={(event) => setOffer({ ...offer, [key]: event.target.value })} />
      )}
    </label>
  );
  return (
    <form
      className="grid gap-3 rounded-2xl border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setProblem("");
        const included = items.split("\n").map((row) => row.trim()).filter(Boolean);
        void onSave({ ...offer, included }, note).then(
          () => setBusy(false),
          (error: unknown) => {
            setBusy(false);
            setProblem(showError(error, "That did not save."));
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {field("name", "Name")}
        {field("price", "Price")}
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-muted-foreground">What&apos;s included (one per line)</span>
        <Textarea rows={4} value={items} onChange={(event) => setItems(event.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("guarantee", "Guarantee", true)}
        {field("terms", "Terms", true)}
      </div>
      {field("targetCustomer", "Target customer")}
      <label className="grid gap-1 text-sm">
        <span className="text-muted-foreground">What changed and why (optional)</span>
        <Input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          Save as a new version
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
    </form>
  );
}

/** Two versions side by side: each field before and after, changed ones highlighted. */
export function OfferCompareView({ comparison }: { comparison: OfferComparison }) {
  const changed = comparison.changes.filter((row) => row.changed).length;
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">
        Version {comparison.from.version} → version {comparison.to.version}: {changed === 0 ? "no changes" : `${changed} field${changed === 1 ? "" : "s"} changed`}
        {comparison.to.note ? <span className="text-card-foreground"> · &ldquo;{comparison.to.note}&rdquo;</span> : null}
      </p>
      <dl className="grid gap-2">
        {comparison.changes.map((row) => (
          <div key={row.field} className={cn("grid gap-2 rounded-xl border p-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]", row.changed ? "border-primary/40 bg-primary/[0.05]" : "border-border")}>
            <dt className="text-xs font-medium text-muted-foreground">{row.label}</dt>
            {row.field === "included" && "added" in row ? (
              <>
                <dd className="text-sm text-muted-foreground">{row.before.join(", ") || "Not stated"}</dd>
                <dd className="grid gap-1 text-sm text-card-foreground">
                  {row.after.join(", ") || "Not stated"}
                  {row.added.length ? <span className="text-xs text-success">+ {row.added.join(", ")}</span> : null}
                  {row.removed.length ? (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <X aria-hidden className="size-3" /> {row.removed.join(", ")}
                    </span>
                  ) : null}
                </dd>
              </>
            ) : (
              <>
                <dd className={cn("text-sm", row.changed ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-muted-foreground")}>{(row.before as string) || "Not stated"}</dd>
                <dd className={cn("text-sm", row.changed ? "font-medium text-card-foreground" : "text-muted-foreground")}>{(row.after as string) || "Not stated"}</dd>
              </>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Saves the card as a PNG, drawn from the card as it looks on screen. */
export async function exportOfferImage(node: HTMLElement, name: string) {
  const { toPng } = await import("html-to-image");
  const background = getComputedStyle(document.body).backgroundColor;
  const url = await toPng(node, { pixelRatio: 2, backgroundColor: background, cacheBust: true });
  download(url, `${fileName(name)}.png`);
}

/** Saves the card as a one-page PDF, drawn with react-pdf in the browser. */
export async function exportOfferPdf(offer: OfferContent, version: number | undefined) {
  const [{ pdf }, { OfferCardPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./offer-card-pdf")]);
  const blob = await pdf(<OfferCardPdf offer={offer} version={version} />).toBlob();
  const url = URL.createObjectURL(blob);
  download(url, `${fileName(offer.name)}.pdf`);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function fileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "offer";
}

function download(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
