"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useRef, useState, type ReactNode } from "react";

import {
  ArrowRight,
  Check,
  ChevronLeft,
  Globe,
  Loader2,
  MapPin,
  PenLine,
  ShieldCheck,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  Users,
  Search,
  Coins,
  RotateCcw,
  CircleHelp,
  Radio,
} from "@/components/icons";
import Logo from "@/components/brand/logo";
import { VistrialMark } from "@/components/brand/vistrial-mark";
import { Button } from "@/components/ui/button";
import { Input, InputGroup } from "@/components/ui/input";
import { ShaderBackdrop } from "@/components/ui/shader-backdrop";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------------------------------- types

export type WizardStage = "about" | "business" | "offer" | "goal" | "review";
export type Person = { fullName: string; role: string; phone: string; heardFrom: string };
export type Business = { name: string; website: string; offer: string; area: string; audience: string };
export type Goal = { kind: string; text: string };
export type SiteRead = {
  status: "idle" | "reading" | "read" | "failed";
  url: string;
  summary: string;
  competitors: string[];
};

export type WizardData = {
  wizardStep: number;
  person: Person;
  business: Business;
  goal: Goal;
  site: SiteRead;
  goals: readonly { kind: string; label: string }[];
};

export type WizardActions = {
  save: (stage: WizardStage, patch: { person?: Person; business?: Business; goal?: Goal }) => Promise<unknown>;
  readSite: (url: string) => Promise<unknown>;
  finish: (options: { serviceTeamAccess: boolean }) => Promise<unknown>;
};

const STEPS: { stage: WizardStage; label: string }[] = [
  { stage: "about", label: "You" },
  { stage: "business", label: "Business" },
  { stage: "offer", label: "What you sell" },
  { stage: "goal", label: "Goal" },
  { stage: "review", label: "Review" },
];

const HEARD_FROM = ["Google search", "Facebook or Instagram", "A friend or referral", "YouTube or a podcast", "Other"];
const ROLES = ["Owner", "Co-owner", "Office manager", "Marketing lead"];
const GOAL_ICONS: Record<string, typeof Target> = {
  leads: TrendingUp,
  ads: Radio,
  competitors: Search,
  prices: Coins,
  retention: RotateCcw,
  other: CircleHelp,
};

export function hostOf(url: string) {
  const raw = url.trim();
  if (!raw) return "";
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "").concat(parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "").toUpperCase();
}

/** What a step needs before Continue works, said plainly. */
export function missingFor(stage: WizardStage, person: Person, business: Business, goal: Goal): string | null {
  if (stage === "about" && !person.fullName.trim()) return "Add your name to continue.";
  if (stage === "business" && !business.name.trim()) return "Add the business name to continue.";
  if (stage === "offer" && !business.offer.trim()) return "Say what you sell to continue.";
  if (stage === "offer" && !business.area.trim()) return "Say where you work to continue.";
  if (stage === "goal" && !goal.kind) return "Pick a goal to continue.";
  return null;
}

// ------------------------------------------------------------------------------------------ wizard

/**
 * Onboarding before paying: one question at a time on the left with a progress rail, and on the right a live
 * business card that fills in as the person answers, over the animated shader. Everything typed here becomes
 * the business profile and memory, so the app never asks again.
 */
export function OnboardingWizard({ data, actions }: { data: WizardData; actions: WizardActions }) {
  const [step, setStep] = useState(() => Math.min(Math.max(data.wizardStep, 0), STEPS.length - 1));
  const [direction, setDirection] = useState(1);
  const [person, setPerson] = useState<Person>(data.person);
  const [business, setBusiness] = useState<Business>(data.business);
  const [goal, setGoal] = useState<Goal>(data.goal);
  const [noWebsite, setNoWebsite] = useState(false);
  const [teamAccess, setTeamAccess] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);
  const stage = STEPS[step]!.stage;

  // The website reader fills empty fields as it finishes; never overwrite what the person typed.
  const remote = data.business;
  const remoteKey = [remote.name, remote.offer, remote.area, remote.audience].join("\u0000");
  const [seenRemote, setSeenRemote] = useState(remoteKey);
  if (seenRemote !== remoteKey) {
    setSeenRemote(remoteKey);
    setBusiness((local) => ({
      ...local,
      name: local.name || remote.name,
      offer: local.offer || remote.offer,
      area: local.area || remote.area,
      audience: local.audience || remote.audience,
    }));
  }

  const missing = missingFor(stage, person, business, goal);

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setError("");
    setTried(false);
    setStep(next);
  };

  const submit = async () => {
    setTried(true);
    if (missing) return;
    setBusy(true);
    setError("");
    try {
      if (stage === "review") {
        await actions.finish({ serviceTeamAccess: teamAccess });
        return;
      }
      const next = STEPS[step + 1]!.stage;
      if (stage === "about") await actions.save(next, { person });
      if (stage === "business") {
        const website = noWebsite ? "" : business.website.trim();
        const nextBusiness = { ...business, website };
        setBusiness(nextBusiness);
        await actions.save(next, { business: nextBusiness });
        if (website && hostOf(website) !== hostOf(data.site.url)) {
          // Reading runs in the background; the next step fills in as it lands.
          void actions.readSite(website).catch(() => undefined);
        }
      }
      if (stage === "offer") await actions.save(next, { business });
      if (stage === "goal") await actions.save(next, { goal });
      go(step + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Left: the question. */}
      <section className="flex min-w-0 flex-col px-5 py-6 sm:px-10 lg:px-14 lg:py-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Logo markOnly className="size-8" title="" />
            <span className="font-heading text-lg text-strong">Vistrial</span>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            Step {step + 1} of {STEPS.length}
          </p>
        </header>

        <ProgressRail step={step} onPick={(index) => index < step && go(index)} />

        <form
          className="mt-10 flex flex-1 flex-col lg:mt-14"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="relative flex-1">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <StepFrame key={stage} direction={direction}>
                {stage === "about" ? (
                  <AboutStep person={person} setPerson={setPerson} tried={tried} />
                ) : stage === "business" ? (
                  <BusinessStep business={business} setBusiness={setBusiness} noWebsite={noWebsite} setNoWebsite={setNoWebsite} tried={tried} />
                ) : stage === "offer" ? (
                  <OfferStep business={business} setBusiness={setBusiness} site={data.site} tried={tried} />
                ) : stage === "goal" ? (
                  <GoalStep goal={goal} setGoal={setGoal} goals={data.goals} />
                ) : (
                  <ReviewStep
                    person={person}
                    business={business}
                    goal={goal}
                    goals={data.goals}
                    teamAccess={teamAccess}
                    setTeamAccess={setTeamAccess}
                    onEdit={(index) => go(index)}
                  />
                )}
              </StepFrame>
            </AnimatePresence>
          </div>

          <footer className="sticky bottom-0 mt-10 flex flex-wrap items-center gap-3 border-t border-border/60 bg-background/90 py-4 backdrop-blur">
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={() => go(step - 1)} disabled={busy}>
                <ChevronLeft aria-hidden /> Back
              </Button>
            ) : null}
            <div className="min-w-0 flex-1 text-sm">
              {error ? (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              ) : tried && missing ? (
                <p role="alert" className="text-warning">
                  {missing}
                </p>
              ) : stage !== "review" ? (
                <p className="hidden text-muted-foreground sm:block">
                  Press <kbd className="rounded border border-border px-1 text-[11px]">Enter</kbd> to continue
                </p>
              ) : null}
            </div>
            <Button type="submit" size="lg" variant="gradient" disabled={busy} className="min-w-40">
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : stage === "review" ? <Sparkles aria-hidden /> : null}
              {stage === "review" ? "Start my free research" : "Continue"}
              {!busy && stage !== "review" ? <ArrowRight aria-hidden /> : null}
            </Button>
          </footer>
        </form>
      </section>

      {/* Right: the live business card. */}
      <aside className="relative isolate hidden overflow-hidden border-l border-border/60 lg:block">
        <ShaderBackdrop className="-z-10" />
        <div className="sticky top-0 flex min-h-dvh items-center justify-center p-10 xl:p-16">
          <BusinessCard person={person} business={business} goal={goal} goals={data.goals} site={data.site} stage={stage} />
        </div>
      </aside>
    </div>
  );
}

// ----------------------------------------------------------------------------------------- pieces

function ProgressRail({ step, onPick }: { step: number; onPick: (index: number) => void }) {
  return (
    <nav aria-label="Onboarding steps" className="mt-8">
      <ol className="grid grid-cols-5 gap-2">
        {STEPS.map((item, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <li key={item.stage} className="grid gap-2">
              <span className="relative h-1.5 overflow-hidden rounded-full bg-overlay/[0.08]">
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-[#a78bfa]"
                  initial={false}
                  animate={{ width: done ? "100%" : current ? "45%" : "0%" }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
              <button
                type="button"
                onClick={() => onPick(index)}
                disabled={!done}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "items-center gap-1 text-left text-[11px] font-medium tracking-wide whitespace-nowrap uppercase transition-colors",
                  current ? "flex sm:truncate" : "hidden truncate sm:flex",
                  current ? "text-strong" : done ? "text-primary hover:underline" : "text-muted-foreground/70",
                )}
              >
                {done ? <Check className="size-3 shrink-0" aria-hidden /> : null}
                <span className={current ? "sm:truncate" : "truncate"}>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepFrame({ children, direction }: { children: ReactNode; direction: number }) {
  const still = useReducedMotion();
  return (
    <motion.div
      initial={still ? false : { opacity: 0, x: 28 * direction, filter: "blur(6px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={still ? undefined : { opacity: 0, x: -20 * direction, filter: "blur(4px)" }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="grid max-w-xl gap-8"
    >
      {children}
    </motion.div>
  );
}

function Question({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div className="grid gap-3">
      <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">{eyebrow}</p>
      <h1 className="font-heading text-3xl leading-tight text-balance text-strong sm:text-4xl">{title}</h1>
      <p className="max-w-lg text-base leading-7 text-pretty text-muted-foreground">{detail}</p>
    </div>
  );
}

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-strong">
        {label}
        {hint ? <span className="ml-2 font-normal text-muted-foreground">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

function Chips({ options, value, onPick, label }: { options: string[]; value: string; onPick: (value: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(on ? "" : option)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all",
              on
                ? "border-primary/50 bg-primary/10 text-strong shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_14%,transparent)]"
                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-strong",
            )}
          >
            {on ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
            {option}
          </button>
        );
      })}
    </div>
  );
}

const bigInput = "h-12 items-center text-base";
const affix = "[&_svg]:size-5";

function AboutStep({ person, setPerson, tried }: { person: Person; setPerson: (next: Person) => void; tried: boolean }) {
  const first = person.fullName.trim().split(/\s+/)[0];
  return (
    <>
      <Question
        eyebrow="Welcome to Vistrial"
        title={first ? `Hi ${first}, let's get you set up.` : "First, a little about you."}
        detail="A few quick questions so your growth team knows who it works for. It takes about two minutes."
      />
      <div className="grid gap-5">
        <Field label="Your full name" htmlFor="ob-name">
          <Input
            id="ob-name"
            autoFocus
            autoComplete="name"
            className={bigInput}
            value={person.fullName}
            aria-invalid={tried && !person.fullName.trim() ? true : undefined}
            onChange={(event) => setPerson({ ...person, fullName: event.target.value })}
            placeholder="Jordan Smith"
          />
        </Field>
        <Field label="Your role" htmlFor="ob-role">
          <Input
            id="ob-role"
            autoComplete="organization-title"
            className={bigInput}
            value={person.role}
            onChange={(event) => setPerson({ ...person, role: event.target.value })}
            placeholder="Owner"
          />
          <Chips label="Common roles" options={ROLES} value={person.role} onPick={(role) => setPerson({ ...person, role })} />
        </Field>
        <Field label="Phone" hint="Optional. Only for your account." htmlFor="ob-phone">
          <Input
            id="ob-phone"
            type="tel"
            autoComplete="tel"
            className={bigInput}
            value={person.phone}
            onChange={(event) => setPerson({ ...person, phone: event.target.value })}
            placeholder="(555) 123-4567"
          />
        </Field>
        <div className="grid gap-2">
          <p className="text-sm font-medium text-strong">How did you hear about us?</p>
          <Chips label="How did you hear about us?" options={HEARD_FROM} value={person.heardFrom} onPick={(heardFrom) => setPerson({ ...person, heardFrom })} />
        </div>
      </div>
    </>
  );
}

function BusinessStep({
  business,
  setBusiness,
  noWebsite,
  setNoWebsite,
  tried,
}: {
  business: Business;
  setBusiness: (next: Business) => void;
  noWebsite: boolean;
  setNoWebsite: (next: boolean) => void;
  tried: boolean;
}) {
  return (
    <>
      <Question
        eyebrow="Your business"
        title="What's the business called?"
        detail="Add your website too. Vistrial reads it to fill in the next questions for you, so there's less to type."
      />
      <div className="grid gap-5">
        <Field label="Business name" htmlFor="ob-business">
          <Input
            id="ob-business"
            autoFocus
            autoComplete="organization"
            className={bigInput}
            value={business.name}
            aria-invalid={tried && !business.name.trim() ? true : undefined}
            onChange={(event) => setBusiness({ ...business, name: event.target.value })}
            placeholder="Bright Smile Dental"
          />
        </Field>
        <Field label="Website" htmlFor="ob-website">
          <div className={cn(noWebsite && "opacity-50", affix)}>
            <InputGroup
              prefix={<Globe aria-hidden />}
              id="ob-website"
              inputMode="url"
              autoComplete="url"
              disabled={noWebsite}
              className={bigInput}
              value={business.website}
              onChange={(event) => setBusiness({ ...business, website: event.target.value })}
              placeholder="yourbusiness.com"
            />
          </div>
          <label className="mt-1 flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={noWebsite}
              onChange={(event) => setNoWebsite(event.target.checked)}
            />
            We don&apos;t have a website yet
          </label>
        </Field>
        {business.website.trim() && !noWebsite && hostOf(business.website) ? (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-sm text-muted-foreground"
          >
            <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
            When you continue, Vistrial reads <span className="font-medium text-strong">{hostOf(business.website)}</span> for you.
          </motion.p>
        ) : null}
      </div>
    </>
  );
}

function OfferStep({ business, setBusiness, site, tried }: { business: Business; setBusiness: (next: Business) => void; site: SiteRead; tried: boolean }) {
  return (
    <>
      <Question
        eyebrow="What you sell"
        title="What do you sell, and where?"
        detail="In your own words, the way you'd tell a new customer. This is what your research is about."
      />
      <SiteStatus site={site} />
      <div className="grid gap-5">
        <Field label="What you sell" htmlFor="ob-offer">
          <Textarea
            id="ob-offer"
            autoFocus
            rows={3}
            className="text-base"
            value={business.offer}
            aria-invalid={tried && !business.offer.trim() ? true : undefined}
            onChange={(event) => setBusiness({ ...business, offer: event.target.value })}
            placeholder="Family and cosmetic dentistry: cleanings, implants, Invisalign"
          />
        </Field>
        <Field label="Where you work" hint="City, area or region" htmlFor="ob-area">
          <div className={affix}>
            <InputGroup
              prefix={<MapPin aria-hidden />}
              id="ob-area"
              className={bigInput}
              value={business.area}
              aria-invalid={tried && !business.area.trim() ? true : undefined}
              onChange={(event) => setBusiness({ ...business, area: event.target.value })}
              placeholder="Austin, TX and 20 miles around"
            />
          </div>
        </Field>
        <Field label="Who your customers are" hint="Optional" htmlFor="ob-audience">
          <div className={affix}>
            <InputGroup
              prefix={<Users aria-hidden />}
              id="ob-audience"
              className={bigInput}
              value={business.audience}
              onChange={(event) => setBusiness({ ...business, audience: event.target.value })}
              placeholder="Families and working professionals"
            />
          </div>
        </Field>
      </div>
    </>
  );
}

function SiteStatus({ site }: { site: SiteRead }) {
  if (site.status === "idle" || !site.url) return null;
  const host = hostOf(site.url);
  if (site.status === "reading") {
    return (
      <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
        <span className="absolute inset-y-0 left-0 w-1/3 animate-[ob-scan_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary/15 to-transparent motion-reduce:hidden" aria-hidden />
        <p className="relative flex items-center gap-2 text-strong">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          Reading {host}… the answers fill in as soon as it&apos;s done.
        </p>
      </div>
    );
  }
  if (site.status === "read") {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-success/25 bg-success/5 px-4 py-3 text-sm text-strong">
        <Check className="size-4 text-success" aria-hidden />
        Filled in from {host}. Change anything that isn&apos;t right.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
      <Globe className="size-4" aria-hidden />
      We couldn&apos;t read {host}, so fill these in yourself. It only takes a moment.
    </p>
  );
}

function GoalStep({ goal, setGoal, goals }: { goal: Goal; setGoal: (next: Goal) => void; goals: WizardData["goals"] }) {
  return (
    <>
      <Question
        eyebrow="Your main goal"
        title="What would help the business most right now?"
        detail="Pick one. Your free research session starts with this question."
      />
      <div role="radiogroup" aria-label="Main goal" className="grid gap-2.5 sm:grid-cols-2">
        {goals.map((item) => {
          const Icon = GOAL_ICONS[item.kind] ?? Target;
          const on = goal.kind === item.kind;
          return (
            <button
              key={item.kind}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setGoal({ ...goal, kind: item.kind })}
              className={cn(
                "group flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all",
                on
                  ? "border-primary/50 bg-primary/[0.07] shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_14%,transparent)]"
                  : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors [&_svg]:size-5",
                  on ? "border-primary/40 bg-primary text-primary-foreground" : "border-border bg-background text-primary",
                )}
              >
                <Icon aria-hidden />
              </span>
              <span className="text-sm font-medium text-strong">{item.label}</span>
              {on ? <Check className="ml-auto size-4 text-primary" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <Field label="Anything specific?" hint="Optional" htmlFor="ob-goal">
        <Textarea
          id="ob-goal"
          rows={2}
          className="text-base"
          value={goal.text}
          onChange={(event) => setGoal({ ...goal, text: event.target.value })}
          placeholder="We get calls, but too few turn into booked jobs."
        />
      </Field>
    </>
  );
}

function ReviewStep({
  person,
  business,
  goal,
  goals,
  teamAccess,
  setTeamAccess,
  onEdit,
}: {
  person: Person;
  business: Business;
  goal: Goal;
  goals: WizardData["goals"];
  teamAccess: boolean;
  setTeamAccess: (next: boolean) => void;
  onEdit: (step: number) => void;
}) {
  const goalLabel = goals.find((item) => item.kind === goal.kind)?.label ?? "";
  const rows: { label: string; value: string; step: number }[] = [
    { label: "You", value: [person.fullName, person.role].filter(Boolean).join(", "), step: 0 },
    { label: "Business", value: [business.name, hostOf(business.website)].filter(Boolean).join(" · "), step: 1 },
    { label: "Sells", value: business.offer, step: 2 },
    { label: "Where", value: business.area, step: 2 },
    { label: "Goal", value: goal.text ? `${goalLabel}: ${goal.text}` : goalLabel, step: 3 },
  ];
  return (
    <>
      <Question
        eyebrow="Ready"
        title="Looks good? Let's do your first research."
        detail="Vistrial saves this as your business profile, so you won't be asked again. Your first research session is free."
      />
      <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-4 px-4 py-3">
            <dt className="w-20 shrink-0 pt-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{row.label}</dt>
            <dd className="min-w-0 flex-1 text-sm text-strong">{row.value || <span className="text-muted-foreground">Not given</span>}</dd>
            <button
              type="button"
              onClick={() => onEdit(row.step)}
              className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
              aria-label={`Edit ${row.label}`}
            >
              <PenLine className="size-3.5" aria-hidden /> Edit
            </button>
          </div>
        ))}
      </dl>
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/5 text-primary [&_svg]:size-5">
          <ShieldCheck aria-hidden />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="text-sm font-medium text-strong">Let the Vistrial team help set things up</p>
          <p className="text-sm text-muted-foreground">
            Our team can open your account for a limited time to help, and every visit is logged. Turn it off any time in Settings.
          </p>
        </div>
        <Switch checked={teamAccess} onCheckedChange={setTeamAccess} aria-label="Let the Vistrial team help set things up" />
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------- live card

function Favicon({ host, name }: { host: string; name: string }) {
  const [failedHost, setFailedHost] = useState("");
  const failed = failedHost === host;
  const letters = initials(name) || "?";
  return (
    <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-overlay/[0.08] bg-gradient-to-br from-primary/20 to-[#a78bfa]/20 font-heading text-lg text-strong shadow-sm">
      {host && !failed ? (
        // A public favicon service; the site's own icon is the best logo there is before upload.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`}
          alt=""
          className="size-9 rounded-md bg-white object-contain p-0.5"
          onError={() => setFailedHost(host)}
        />
      ) : (
        letters
      )}
    </span>
  );
}

function CardRow({
  icon: Icon,
  label,
  value,
  active,
  placeholder,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  active: boolean;
  placeholder: string;
}) {
  return (
    <motion.div
      layout
      className={cn(
        "flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors",
        active && "bg-primary/[0.07] ring-1 ring-primary/25",
      )}
    >
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4", value ? "bg-primary/10 text-primary" : "bg-overlay/[0.05] text-muted-foreground")}>
        <Icon aria-hidden />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
        <AnimatePresence mode="wait" initial={false}>
          {value ? (
            <motion.p
              key="value"
              initial={{ opacity: 0, y: 4, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
              className="line-clamp-2 text-sm text-strong"
            >
              {value}
            </motion.p>
          ) : (
            <motion.span key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-muted-foreground/70 italic">
              {placeholder}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export function BusinessCard({
  person,
  business,
  goal,
  goals,
  site,
  stage,
}: {
  person: Person;
  business: Business;
  goal: Goal;
  goals: WizardData["goals"];
  site: SiteRead;
  stage: WizardStage;
}) {
  const host = hostOf(business.website);
  const goalLabel = goals.find((item) => item.kind === goal.kind)?.label ?? "";
  const filled = useMemo(
    () => [person.fullName, business.name, business.offer, business.area, business.audience, goal.kind].filter((value) => value.trim()).length,
    [person.fullName, business.name, business.offer, business.area, business.audience, goal.kind],
  );
  const percent = Math.round((filled / 6) * 100);
  const reading = site.status === "reading";
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="grid w-full max-w-md gap-4">
      <motion.div
        ref={ref}
        layout
        className="relative overflow-hidden rounded-3xl border border-overlay/[0.08] bg-card/80 p-5 shadow-[0_40px_80px_-40px_color-mix(in_oklab,var(--color-primary)_55%,transparent)] backdrop-blur-xl"
      >
        {reading ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-[ob-sweep_2.4s_ease-in-out_infinite] bg-gradient-to-b from-primary/0 via-primary/15 to-primary/0 motion-reduce:hidden"
          />
        ) : null}
        <div className="relative flex items-center gap-4">
          <Favicon host={host} name={business.name} />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <p className={cn("truncate font-heading text-xl", business.name ? "text-strong" : "text-muted-foreground/70")}>{business.name || "Your business"}</p>
            <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <Globe className="size-3.5 shrink-0" aria-hidden />
              {host || "No website yet"}
            </p>
          </div>
        </div>

        <div className="relative mt-4 flex items-center gap-2 text-xs">
          {reading ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-primary">
              <Loader2 className="size-3 animate-spin" aria-hidden /> Reading the website
            </span>
          ) : site.status === "read" ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2 py-1 text-success">
              <Check className="size-3" aria-hidden /> Read from {hostOf(site.url)}
            </span>
          ) : null}
          <span className="ml-auto tabular-nums text-muted-foreground">{percent}% complete</span>
        </div>
        <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-overlay/[0.08]">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-[#a78bfa]" initial={false} animate={{ width: `${percent}%` }} transition={{ duration: 0.6 }} />
        </div>

        <div className="relative mt-4 grid gap-1">
          <CardRow icon={Store} label="Sells" value={business.offer} active={stage === "offer"} placeholder="What you sell" />
          <CardRow icon={MapPin} label="Where" value={business.area} active={stage === "offer"} placeholder="Where you work" />
          <CardRow icon={Users} label="Customers" value={business.audience} active={stage === "offer"} placeholder="Who you serve" />
          <CardRow
            icon={Target}
            label="Main goal"
            value={goal.text ? `${goalLabel}: ${goal.text}` : goalLabel}
            active={stage === "goal"}
            placeholder="What would help most"
          />
        </div>

        {site.competitors.length ? (
          <div className="relative mt-3 flex flex-wrap gap-1.5 px-3">
            {site.competitors.map((name) => (
              <span key={name} className="rounded-md border border-border bg-background/70 px-2 py-0.5 text-xs text-muted-foreground">
                {name}
              </span>
            ))}
          </div>
        ) : null}

        <div className="relative mt-4 flex items-center gap-3 border-t border-border/70 pt-4">
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-full text-xs font-semibold",
              person.fullName ? "bg-primary text-primary-foreground" : "bg-overlay/[0.06] text-muted-foreground",
              stage === "about" && "ring-2 ring-primary/30 ring-offset-2 ring-offset-card",
            )}
          >
            {initials(person.fullName) || "?"}
          </span>
          <div className="grid min-w-0 flex-1">
            <p className="truncate text-sm text-strong">{person.fullName || "You"}</p>
            <p className="truncate text-xs text-muted-foreground">{person.role || "Your role"}</p>
          </div>
        </div>
      </motion.div>

      <div className="flex items-center gap-3 rounded-2xl border border-overlay/[0.08] bg-card/70 px-4 py-3 backdrop-blur-xl">
        <VistrialMark size="sm" />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-strong">Growth Architect</span>{" "}
          {stage === "review" ? "is ready to start your first research." : "fills this in as you go. You won’t be asked again."}
        </p>
      </div>
    </div>
  );
}
