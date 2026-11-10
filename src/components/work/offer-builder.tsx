"use client";

import { useState, type ReactNode } from "react";

import { ArrowLeft, ArrowRight, Building2, Check, Copy, Plus, Trash2, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";
import { cn } from "@/lib/utils";
import {
  EMPTY_OFFER,
  GUARANTEE_TYPES,
  GUARANTEE_WORDS,
  MAX,
  PRICE_KINDS,
  PRICE_KIND_WORDS,
  amountNumber,
  cleanOffer,
  itemsTotal,
  offerProblem,
  type GuaranteeType,
  type OfferContent,
  type OfferInput,
  type OfferItem,
  type OfferTier,
  type PriceKind,
} from "../../../convex/lib/offerCards";

import { OfferCardView } from "./offer-card";

/** What the form holds while a person types: every row as typed, blanks included. */
export type OfferDraft = {
  name: string;
  targetCustomer: string;
  outcome: string;
  priceKind: PriceKind;
  amount: string;
  was: string;
  tiers: OfferTier[];
  items: OfferItem[];
  bonuses: string[];
  guaranteeType: GuaranteeType | "";
  guarantee: string;
  terms: string;
  cta: string;
  channel: string;
};

const BLANK_TIERS: OfferTier[] = [
  { name: "", price: "" },
  { name: "", price: "" },
];

/** Opens saved content in the form. A plain-text price from before the builder becomes the amount when it has a number. */
export function draftFrom(offer: OfferContent): OfferDraft {
  const pricing = offer.pricing;
  const items = offer.items.length ? offer.items : offer.included.map((text) => ({ text, value: "" }));
  return {
    name: offer.name,
    targetCustomer: offer.targetCustomer,
    outcome: offer.outcome,
    priceKind: pricing?.kind ?? (/\/\s?mo|month|retainer/i.test(offer.price) ? "monthly" : "oneTime"),
    amount: pricing ? pricing.amount : amountNumber(offer.price) === null ? "" : offer.price.replace(/\s?\/\s?mo(nth)?$/i, ""),
    was: pricing?.was ?? "",
    tiers: pricing?.tiers.length ? pricing.tiers : BLANK_TIERS,
    items: items.length ? items : [{ text: "", value: "" }],
    bonuses: offer.bonuses.length ? offer.bonuses : [""],
    guaranteeType: offer.guaranteeType || (offer.guarantee ? "custom" : ""),
    guarantee: offer.guarantee,
    terms: offer.terms,
    cta: offer.cta,
    channel: offer.channel,
  };
}

/** The form as the server takes it. */
export function inputFrom(draft: OfferDraft): OfferInput {
  return {
    name: draft.name,
    price: "",
    included: [],
    guarantee: draft.guaranteeType === "none" ? "" : draft.guarantee,
    terms: draft.terms,
    targetCustomer: draft.targetCustomer,
    outcome: draft.outcome,
    pricing: { kind: draft.priceKind, amount: draft.amount, was: draft.was, tiers: draft.priceKind === "tiered" ? draft.tiers : [] },
    items: draft.items,
    bonuses: draft.bonuses,
    guaranteeType: draft.guaranteeType,
    cta: draft.cta,
    channel: draft.channel,
  };
}

export const BUILDER_STEPS = [
  { id: "basics", label: "Basics", title: "What is the offer, and who is it for?" },
  { id: "price", label: "Price", title: "What does it cost?" },
  { id: "included", label: "What's included", title: "What do they get?" },
  { id: "guarantee", label: "Bonuses and guarantee", title: "What makes it safe to say yes?" },
  { id: "cta", label: "Call to action", title: "How do they take it up?" },
] as const;

/** The step a problem belongs to, so saving takes the person to the field that needs them. */
export function stepOfProblem(problem: string) {
  if (/offer a name|offer's name|outcome/i.test(problem)) return 0;
  if (/price|tier/i.test(problem)) return 1;
  if (/line item|value of/i.test(problem)) return 2;
  if (/bonus|guarantee|terms/i.test(problem)) return 3;
  return 4;
}

const CTA_IDEAS = ["Book a strategy call", "Get a free ad account audit", "Start a 60-day pilot"];
const CHANNEL_IDEAS = ["Cold outreach", "Referrals", "Paid social", "Search", "Webinar"];

function Field({ label, hint, optional, children }: { label: string; hint?: string; optional?: boolean; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="flex flex-wrap items-baseline gap-x-2 text-card-foreground">
        {label}
        {optional ? <span className="text-xs text-muted-foreground">Optional</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function Ideas({ ideas, onPick, label }: { ideas: string[]; onPick: (idea: string) => void; label: string }) {
  return (
    <span className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {ideas.map((idea) => (
        <button key={idea} type="button" onClick={() => onPick(idea)} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors outline-none hover:border-primary/50 hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-ring">
          {idea}
        </button>
      ))}
    </span>
  );
}

function RemoveRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-overlay/[0.06] hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring">
      <Trash2 aria-hidden className="size-4" />
    </button>
  );
}

export type BuilderStart = {
  /** A draft from the business profile (what onboarding read from the website and the owner confirmed). */
  profile: OfferContent | null;
  /** Existing offers a new one can start as a copy of. */
  copies: { id: string; offer: OfferContent }[];
};

/**
 * The offer builder: five short steps with the offer card drawn live beside them (below them on a phone).
 * A new offer can start blank, from the business profile, or as a copy of an existing offer. Saving an
 * existing offer makes a new version. The server checks everything again and says what is wrong.
 */
export function OfferBuilder({
  initial,
  editing,
  start,
  initialStep = 0,
  onSave,
  onCancel,
}: {
  initial: OfferContent;
  /** The offer being edited, or null for a new one. */
  editing: { name: string; nextVersion: number } | null;
  start?: BuilderStart;
  initialStep?: number;
  onSave: (offer: OfferInput, note: string, copyOf: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<OfferDraft>(() => draftFrom(initial));
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), BUILDER_STEPS.length - 1));
  const [origin, setOrigin] = useState<"blank" | "profile" | string>("blank");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const set = <K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) => {
    setProblem("");
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const preview = cleanOffer(inputFrom(draft));
  const last = step === BUILDER_STEPS.length - 1;
  const current = BUILDER_STEPS[step];

  const startFrom = (next: "blank" | "profile" | string) => {
    setOrigin(next);
    setProblem("");
    if (next === "blank") setDraft(draftFrom(EMPTY_OFFER));
    else if (next === "profile" && start?.profile) setDraft(draftFrom(start.profile));
    else {
      const source = start?.copies.find((row) => row.id === next);
      if (source) setDraft(draftFrom({ ...source.offer, name: `${source.offer.name} (copy)`.slice(0, MAX.name) }));
    }
  };

  const save = () => {
    const input = inputFrom(draft);
    const wrong = offerProblem(input);
    if (wrong) {
      setProblem(wrong);
      setStep(stepOfProblem(wrong));
      return;
    }
    setBusy(true);
    setProblem("");
    void onSave(input, note, origin !== "blank" && origin !== "profile" ? origin : null).then(
      () => setBusy(false),
      (error: unknown) => {
        setBusy(false);
        const words = showError(error, "That did not save.");
        setProblem(words);
        setStep(stepOfProblem(words));
      },
    );
  };

  const rows = <T,>(key: "items" | "bonuses" | "tiers", list: T[], index: number, value: T) => set(key, list.map((row, i) => (i === index ? value : row)) as never);

  return (
    <section aria-label={editing ? `Edit ${editing.name}` : "New offer"} className="grid min-w-0 gap-4 rounded-3xl border border-border bg-card/60 p-4 sm:p-5 [&>*]:min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Offer builder</p>
          <h2 className="font-heading text-lg text-card-foreground">{editing ? `Edit ${editing.name}` : "New offer"}</h2>
          <p className="text-sm text-muted-foreground">{editing ? `Saving makes version ${editing.nextVersion}. Earlier versions are kept.` : "Five short steps. The card on the right fills in as you go."}</p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X aria-hidden className="size-4" /> Cancel
        </Button>
      </header>

      {!editing && start ? (
        <div className="grid gap-2 rounded-2xl border border-border bg-background/60 p-3 [&>*]:min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Start from</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Start from">
            <StartChoice active={origin === "blank"} onClick={() => startFrom("blank")} icon={<Plus aria-hidden className="size-3.5" />} label="Blank" />
            <StartChoice
              active={origin === "profile"}
              disabled={!start.profile}
              onClick={() => startFrom("profile")}
              icon={<Building2 aria-hidden className="size-3.5" />}
              label="Business profile"
              title={start.profile ? "What Vistrial read from your website and you confirmed" : "No business profile yet"}
            />
            {start.copies.map((row) => (
              <StartChoice key={row.id} active={origin === row.id} onClick={() => startFrom(row.id)} icon={<Copy aria-hidden className="size-3.5" />} label={`Copy of ${row.offer.name}`} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {origin === "profile"
              ? "Filled in from your business profile: what Vistrial read from your website and you confirmed. Change anything."
              : origin !== "blank"
                ? "A copy to change. The offer you copied stays as it is."
                : start.profile
                  ? "Or start from your business profile, or a copy of an offer you already have."
                  : "Your business profile is empty, so there is nothing to start from yet."}
          </p>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
        <form
          className="grid min-w-0 content-start gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (last) save();
            else setStep(step + 1);
          }}
        >
          <nav aria-label="Builder steps">
            <ol className="flex flex-wrap gap-1.5">
              {BUILDER_STEPS.map((row, index) => {
                const on = index === step;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      aria-current={on ? "step" : undefined}
                      onClick={() => setStep(index)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        on ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground",
                      )}
                    >
                      <span aria-hidden className={cn("flex size-4 items-center justify-center rounded-full text-[10px] font-semibold", index < step ? "bg-primary/20 text-primary" : "bg-overlay/[0.08]")}>
                        {index < step ? <Check className="size-2.5" /> : index + 1}
                      </span>
                      {row.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <fieldset className="grid min-w-0 gap-4">
            <legend className="mb-3 font-heading text-base text-card-foreground">
              <span className="text-muted-foreground">
                Step {step + 1} of {BUILDER_STEPS.length} ·{" "}
              </span>
              {current.title}
            </legend>

            {current.id === "basics" ? (
              <>
                <Field label="Offer name">
                  <Input value={draft.name} maxLength={MAX.name} placeholder="Done-for-you lead generation retainer" onChange={(event) => set("name", event.target.value)} />
                </Field>
                <Field label="Who it is for" hint="The client this is built for. The narrower, the better.">
                  <Input value={draft.targetCustomer} maxLength={MAX.targetCustomer} placeholder="Home-service brands doing $1M to $5M a year" onChange={(event) => set("targetCustomer", event.target.value)} />
                </Field>
                <Field label="The outcome they get" hint="What changes for the client, in their words. A number helps.">
                  <Textarea rows={2} value={draft.outcome} maxLength={MAX.outcome} placeholder="20 booked sales calls every month" onChange={(event) => set("outcome", event.target.value)} />
                </Field>
              </>
            ) : null}

            {current.id === "price" ? (
              <>
                <div className="grid gap-1.5 text-sm">
                  <span className="text-card-foreground">How it is priced</span>
                  <SegmentedRadioGroup aria-label="How it is priced" value={draft.priceKind} onValueChange={(value) => set("priceKind", value as PriceKind)} options={PRICE_KINDS.map((kind) => ({ value: kind, label: PRICE_KIND_WORDS[kind] }))} className="w-full sm:w-fit" />
                </div>
                {draft.priceKind === "tiered" ? (
                  <div className="grid gap-2">
                    <span className="text-sm text-card-foreground">Tiers</span>
                    {draft.tiers.map((tier, index) => (
                      <div key={index} className="flex min-w-0 items-center gap-2">
                        <Input aria-label={`Tier ${index + 1} name`} className="min-w-0 flex-1" value={tier.name} maxLength={MAX.tierName} placeholder={["Starter", "Growth", "Scale", "Enterprise"][index] ?? "Tier"} onChange={(event) => rows("tiers", draft.tiers, index, { ...tier, name: event.target.value })} />
                        <Input aria-label={`Tier ${index + 1} price`} className="w-28 shrink-0 sm:w-36" value={tier.price} maxLength={MAX.amount} placeholder={["$1,500/mo", "$2,500/mo", "$4,000/mo", "$6,500/mo"][index] ?? "$"} onChange={(event) => rows("tiers", draft.tiers, index, { ...tier, price: event.target.value })} />
                        {draft.tiers.length > 2 ? <RemoveRow label={`Remove tier ${index + 1}`} onClick={() => set("tiers", draft.tiers.filter((_, i) => i !== index))} /> : null}
                      </div>
                    ))}
                    {draft.tiers.length < MAX.tiers ? (
                      <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => set("tiers", [...draft.tiers, { name: "", price: "" }])}>
                        <Plus aria-hidden className="size-4" /> Add a tier
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={draft.priceKind === "monthly" ? "Price a month" : "Price"} hint={draft.priceKind === "monthly" ? "Shown as a monthly price, for example $2,500/mo." : "One payment for the whole offer."}>
                      <Input inputMode="decimal" value={draft.amount} maxLength={MAX.amount} placeholder={draft.priceKind === "monthly" ? "$2,500" : "$4,000"} onChange={(event) => set("amount", event.target.value)} />
                    </Field>
                    <Field label={'"Was" price'} optional hint="The higher price this replaces. Shown struck through.">
                      <Input inputMode="decimal" value={draft.was} maxLength={MAX.amount} placeholder={draft.priceKind === "monthly" ? "$3,000" : "$5,000"} onChange={(event) => set("was", event.target.value)} />
                    </Field>
                  </div>
                )}
              </>
            ) : null}

            {current.id === "included" ? (
              <div className="grid gap-2">
                <span className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-card-foreground">
                  Line items
                  <span className="text-xs text-muted-foreground">A value is optional. {itemsTotal(preview.items) ? `Total value so far: ${itemsTotal(preview.items)}.` : "Add values to show what it is all worth."}</span>
                </span>
                {draft.items.map((item, index) => (
                  <div key={index} className="flex min-w-0 items-center gap-2">
                    <Input aria-label={`Line item ${index + 1}`} className="min-w-0 flex-1" value={item.text} maxLength={MAX.item} placeholder={["Paid ads management on Meta and Google", "Two landing pages, built and tested", "Weekly lead report"][index] ?? "What they get"} onChange={(event) => rows("items", draft.items, index, { ...item, text: event.target.value })} />
                    <Input aria-label={`Value of line item ${index + 1}`} inputMode="decimal" className="w-24 shrink-0 sm:w-32" value={item.value} maxLength={MAX.itemValue} placeholder="$1,500" onChange={(event) => rows("items", draft.items, index, { ...item, value: event.target.value })} />
                    <RemoveRow label={`Remove line item ${index + 1}`} onClick={() => set("items", draft.items.length > 1 ? draft.items.filter((_, i) => i !== index) : [{ text: "", value: "" }])} />
                  </div>
                ))}
                {draft.items.length < MAX.items ? (
                  <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => set("items", [...draft.items, { text: "", value: "" }])}>
                    <Plus aria-hidden className="size-4" /> Add a line item
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">An offer lists up to {MAX.items} line items.</p>
                )}
              </div>
            ) : null}

            {current.id === "guarantee" ? (
              <>
                <div className="grid gap-2">
                  <span className="flex flex-wrap items-baseline gap-x-2 text-sm text-card-foreground">
                    Bonuses <span className="text-xs text-muted-foreground">Optional</span>
                  </span>
                  {draft.bonuses.map((bonus, index) => (
                    <div key={index} className="flex min-w-0 items-center gap-2">
                      <Input aria-label={`Bonus ${index + 1}`} className="min-w-0 flex-1" value={bonus} maxLength={MAX.bonus} placeholder={["90-day content calendar", "Sales call scripts"][index] ?? "A bonus"} onChange={(event) => rows("bonuses", draft.bonuses, index, event.target.value)} />
                      <RemoveRow label={`Remove bonus ${index + 1}`} onClick={() => set("bonuses", draft.bonuses.length > 1 ? draft.bonuses.filter((_, i) => i !== index) : [""])} />
                    </div>
                  ))}
                  {draft.bonuses.length < MAX.bonuses ? (
                    <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => set("bonuses", [...draft.bonuses, ""])}>
                      <Plus aria-hidden className="size-4" /> Add a bonus
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-1.5 text-sm">
                  <span className="text-card-foreground">Guarantee type</span>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Guarantee type">
                    {GUARANTEE_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={draft.guaranteeType === type}
                        onClick={() => set("guaranteeType", type)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          draft.guaranteeType === type ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground",
                        )}
                      >
                        {GUARANTEE_WORDS[type]}
                      </button>
                    ))}
                  </div>
                </div>
                {draft.guaranteeType === "none" ? (
                  <p className="text-xs text-muted-foreground">The card will say no guarantee is offered.</p>
                ) : (
                  <Field label="What the guarantee covers" hint="The promise, and what happens if you miss it.">
                    <Textarea rows={2} value={draft.guarantee} maxLength={MAX.guarantee} placeholder="20 booked calls in 60 days or we work free until you get them." onChange={(event) => set("guarantee", event.target.value)} />
                  </Field>
                )}
                <Field label="Terms" optional hint="Contract length, notice, how payment works.">
                  <Textarea rows={2} value={draft.terms} maxLength={MAX.terms} placeholder="Month to month. 30-day notice. Ad spend billed by the platforms." onChange={(event) => set("terms", event.target.value)} />
                </Field>
              </>
            ) : null}

            {current.id === "cta" ? (
              <>
                <Field label="Call to action" hint="The one next step you ask for.">
                  <Input value={draft.cta} maxLength={MAX.cta} placeholder="Book a strategy call" onChange={(event) => set("cta", event.target.value)} />
                </Field>
                <Ideas ideas={CTA_IDEAS} label="Call to action ideas" onPick={(idea) => set("cta", idea)} />
                <Field label="Channel" hint="Where you will put this offer in front of people first.">
                  <Input value={draft.channel} maxLength={MAX.channel} placeholder="Cold outreach" onChange={(event) => set("channel", event.target.value)} />
                </Field>
                <Ideas ideas={CHANNEL_IDEAS} label="Channel ideas" onPick={(idea) => set("channel", idea)} />
                {editing ? (
                  <Field label="What changed and why" optional hint="Kept with the version, so a later comparison explains itself.">
                    <Input value={note} maxLength={MAX.note} placeholder="Raised the price after the September test" onChange={(event) => setNote(event.target.value)} />
                  </Field>
                ) : null}
              </>
            ) : null}
          </fieldset>

          {problem ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/[0.06] px-3 py-2 text-sm text-destructive">
              {problem}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <Button type="button" size="sm" variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
              <ArrowLeft aria-hidden className="size-4" /> Back
            </Button>
            <span className="flex flex-wrap items-center gap-2">
              {!last ? (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={save}>
                  {editing ? `Save as version ${editing.nextVersion}` : "Save offer"}
                </Button>
              ) : null}
              <Button type="submit" size="sm" disabled={busy}>
                {last ? (busy ? "Saving…" : editing ? `Save as version ${editing.nextVersion}` : "Save offer") : "Next"}
                {last ? null : <ArrowRight aria-hidden className="size-4" />}
              </Button>
            </span>
          </div>
        </form>

        <aside aria-label="Live preview" className="grid min-w-0 content-start gap-2 lg:sticky lg:top-4 lg:self-start">
          <p className="text-xs font-medium text-muted-foreground">Live preview</p>
          <OfferCardView offer={preview} draft />
        </aside>
      </div>
    </section>
  );
}

function StartChoice({ active, disabled, onClick, icon, label, title }: { active: boolean; disabled?: boolean; onClick: () => void; icon: ReactNode; label: string; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        active ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
