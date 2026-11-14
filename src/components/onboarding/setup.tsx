"use client";

import { useState, type ReactNode } from "react";

import { ArrowRight, Check, ChevronLeft, CircleDashed, Globe, Loader2, LoaderCircle, Plug, ShieldCheck, Sparkles, TriangleAlert, Upload } from "@/components/icons";
import Logo from "@/components/brand/logo";
import { SiteCaptureView, defaultTake, type CaptureChoices, type CaptureData } from "@/components/settings/brand-section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { STATE_WORDS, type ConnectCard } from "@/lib/onboarding/connect";
import { errorWords } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { PAGE_KIND_WORDS, type PageKind } from "../../../convex/lib/siteCapture/fields";
import { teardownPick } from "../../../convex/lib/siteCapture/pages";

export type SetupStage = "website" | "connect" | "confirm";

export type SetupData = {
  stage: SetupStage;
  person: { fullName: string; role: string };
  business: { name: string; website: string; offer: string; area: string; audience: string };
  goal: { kind: string; text: string };
  goals: readonly { kind: string; label: string }[];
  hasWorkspace: boolean;
};

export type ConfirmPayload = {
  person: { fullName: string; role: string };
  business: { name: string; offer: string; area: string; audience: string };
  goal: { kind: string; text: string };
  choices: { take: string[]; logoOwned: boolean; edits: CaptureChoices["edits"] } | undefined;
  teardownPages: string[];
  serviceTeamAccess: boolean;
};

export type SetupActions = {
  submitWebsite: (url: string) => Promise<unknown>;
  skipWebsite: () => Promise<unknown>;
  goTo: (stage: SetupStage) => Promise<unknown>;
  /** Starts connecting an account. Resolves when the browser is on its way to the provider, or the upload is open. */
  connect: (key: string) => Promise<unknown>;
  confirm: (payload: ConfirmPayload) => Promise<unknown>;
};

const STEPS = [
  { stage: "website", label: "Website" },
  { stage: "connect", label: "Connect" },
  { stage: "confirm", label: "Confirm" },
  { stage: "go", label: "Go" },
] as const;
const ROLES = ["Owner", "Co-owner", "Marketing lead", "Operations"];

function hostOf(url: string) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function Rail({ index }: { index: number }) {
  return (
    <nav aria-label="Onboarding steps" className="mt-8">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((item, at) => (
          <li key={item.stage} className="grid gap-2">
            <span className="relative h-1.5 overflow-hidden rounded-full bg-overlay/[0.08]">
              <span className={cn("absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-[#a78bfa] transition-all duration-500", at < index ? "w-full" : at === index ? "w-[45%]" : "w-0")} />
            </span>
            <span aria-current={at === index ? "step" : undefined} className={cn("flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase", at === index ? "text-strong" : at < index ? "text-primary" : "text-muted-foreground/70")}>
              {at < index ? <Check aria-hidden className="size-3" /> : null}
              {item.label}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Question({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div className="grid gap-3">
      <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">{eyebrow}</p>
      <h1 className="font-heading text-3xl leading-tight text-balance text-strong sm:text-4xl">{title}</h1>
      <p className="max-w-xl text-base leading-7 text-pretty text-muted-foreground">{detail}</p>
    </div>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
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

function Chips({ options, value, onPick, label }: { options: { value: string; label: string }[]; value: string; onPick: (value: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(on ? "" : option.value)}
            className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all", on ? "border-primary/50 bg-primary/10 text-strong" : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-strong")}
          >
            {on ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** What the capture has found so far, as it lands: the logo, the colours, the fonts, the offers. */
function LivePreview({ capture }: { capture: CaptureData | null }) {
  const result = capture?.result;
  // Pages read on the site itself; a booking tool on another site is listed on Confirm, not here.
  const pages = capture?.pages.filter((page) => page.id !== "p1" && page.id.startsWith("p")) ?? [];
  return (
    <div className="grid gap-4 rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm backdrop-blur">
      <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">What we found</p>
      <div className="flex items-center gap-3">
        {capture?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a stored file's short-lived link
          <img src={capture.logoUrl} alt="Logo found on your website" className="h-10 w-auto max-w-36 rounded border border-border/60 bg-white object-contain p-1" />
        ) : (
          <span className="grid size-10 place-items-center rounded-lg border border-dashed border-border text-muted-foreground">
            <CircleDashed aria-hidden className="size-4" />
          </span>
        )}
        <div className="grid">
          <span className="font-heading text-lg text-strong">{result?.name.value ?? (capture ? hostOf(capture.url) : "Your business")}</span>
          <span className="text-xs text-muted-foreground">{capture ? hostOf(capture.url) : "Your website"}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(result?.colors.value ?? []).map((color) => (
          <span key={color.hex} className="flex items-center gap-1.5 rounded-full border border-border/60 py-0.5 pr-2 pl-0.5 text-xs">
            <span aria-hidden className="size-5 rounded-full" style={{ backgroundColor: color.hex }} />
            <span className="font-mono">{color.hex}</span>
          </span>
        ))}
        {result?.headingFont.value ? <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs">{result.headingFont.value}</span> : null}
        {result?.bodyFont.value ? <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs">{result.bodyFont.value}</span> : null}
      </div>
      {result?.offers.value?.length ? (
        <ul className="grid gap-1 text-sm">
          {result.offers.value.slice(0, 3).map((offer) => (
            <li key={offer.name} className="flex justify-between gap-3">
              <span className="truncate text-strong">{offer.name}</span>
              <span className="shrink-0 text-muted-foreground">{offer.price || "No price stated"}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {pages.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {pages.map((page) => (
            <li key={page.id} className="rounded-md bg-primary/8 px-2 py-0.5 text-xs text-primary">
              {PAGE_KIND_WORDS[page.kind as PageKind] ?? "Page"}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ProgressRows({ capture }: { capture: CaptureData }) {
  return (
    <ol className="grid gap-2.5" aria-label="Reading your website" aria-live="polite">
      {capture.progress.map((row) => (
        <li key={row.key} className="flex items-center gap-2.5 text-sm">
          {row.state === "done" ? (
            <Check aria-hidden className="size-4 text-success" />
          ) : row.state === "active" ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin text-primary" />
          ) : row.state === "failed" ? (
            <TriangleAlert aria-hidden className="size-4 text-warning" />
          ) : (
            <CircleDashed aria-hidden className="size-4 text-muted-foreground" />
          )}
          <span className={row.state === "waiting" ? "text-muted-foreground" : "text-strong"}>{row.label}</span>
        </li>
      ))}
    </ol>
  );
}

function ConnectTile({ card, onConnect, busy }: { card: ConnectCard; onConnect: () => void; busy: boolean }) {
  const action = card.state === "available" || card.state === "needsReconnect";
  return (
    <li className={cn("grid gap-3 rounded-xl border p-4", card.state === "connected" ? "border-success/40 bg-success/5" : "border-border bg-card")}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="font-medium text-strong">{card.name}</span>
          <span className="text-sm text-muted-foreground">{card.gives}</span>
        </div>
        {card.state === "connected" ? <Check aria-hidden className="size-5 shrink-0 text-success" /> : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-xs", card.state === "connected" ? "text-success-foreground" : "text-muted-foreground")}>
          {STATE_WORDS[card.state]}
          {card.label ? ` · ${card.label}` : ""}
        </span>
        {action ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={onConnect}>
            {card.kind === "upload" ? <Upload aria-hidden className="size-4" /> : <Plug aria-hidden className="size-4" />}
            {card.kind === "upload" ? "Upload" : card.state === "needsReconnect" ? "Reconnect" : "Connect"}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Onboarding: the website, the accounts to connect, then everything found for the person to check before
 * anything runs. Plain data in, so the story page can show every step without a backend.
 */
export function OnboardingSetup({ data, capture, connect, actions, upload, crm }: { data: SetupData; capture: CaptureData | null; connect: ConnectCard[]; actions: SetupActions; upload?: ReactNode; crm?: ReactNode }) {
  const index = STEPS.findIndex((row) => row.stage === data.stage);
  const [url, setUrl] = useState(data.business.website ? hostOf(data.business.website) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const result = capture?.result ?? null;

  // Confirm: prefilled from what the person typed before, then from the site. Nothing is invented.
  const [person, setPerson] = useState({ fullName: data.person.fullName, role: data.person.role || "Owner" });
  const [business, setBusiness] = useState({
    name: data.business.name || result?.name.value || "",
    offer: data.business.offer || (result?.offers.value?.[0] ? result.offers.value.map((offer) => offer.name).join(", ").slice(0, 300) : ""),
    area: data.business.area || result?.location.value || "",
    audience: data.business.audience || result?.audience.value || "",
  });
  const [goal, setGoal] = useState(data.goal);
  const [choices, setChoices] = useState<CaptureChoices>(() => ({ take: defaultTake(result), logoOwned: false, edits: {} }));
  const readPages = (capture?.pages ?? []).filter((page) => page.read).map((page) => ({ ...page, kind: page.kind as PageKind }));
  const [teardown, setTeardown] = useState<string[]>(() => teardownPick(readPages).map((page) => page.id));
  const [teamAccess, setTeamAccess] = useState(true);

  const act = async (work: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(errorWords(cause, fallback));
    } finally {
      setBusy(false);
    }
  };

  const reading = capture && (capture.status === "reading" || capture.status === "understanding");
  const homeDone = capture ? capture.progress[0]?.state === "done" || capture.status === "failed" : false;
  const missing =
    data.stage !== "confirm"
      ? null
      : !person.fullName.trim()
        ? "Add your name."
        : !business.name.trim()
          ? "Add the business name."
          : !business.offer.trim()
            ? "Say what the business sells."
            : !business.area.trim()
              ? "Say where the business works."
              : !goal.kind
                ? "Pick a main goal."
                : choices.take.has("logo") && !choices.logoOwned
                  ? "Confirm you may use the logo, or untick it."
                  : null;

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <section className="flex min-w-0 flex-col px-5 py-6 sm:px-10 lg:px-14 lg:py-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Logo markOnly className="size-8" title="" />
            <span className="font-heading text-lg text-strong">Vistrial</span>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            Step {index + 1} of {STEPS.length}
          </p>
        </header>
        <Rail index={index} />

        <div className="mt-10 grid flex-1 content-start gap-8 lg:mt-14">
          {data.stage === "website" ? (
            <>
              <Question eyebrow="Your website" title="Start with your website" detail="Vistrial reads it the way a visitor would and fills in your brand, offers and pages. You check everything before anything runs." />
              <form
                className="grid max-w-xl gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(() => actions.submitWebsite(url), "That website could not be read.");
                }}
              >
                <Field label="Website" htmlFor="onboarding-site">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input id="onboarding-site" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="yourbusiness.com" inputMode="url" autoComplete="url" className="h-12 text-base" disabled={busy} />
                    <Button type="submit" size="lg" variant={capture ? "outline" : "gradient"} disabled={busy || !url.trim()}>
                      {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Globe aria-hidden />}
                      {capture && hostOf(capture.url) === hostOf(url) ? "Reading" : "Read my site"}
                    </Button>
                  </div>
                </Field>
                <p className="text-xs text-muted-foreground">It is free. Vistrial reads as VistrialBot and stays out of pages your site asks crawlers to skip.</p>
              </form>
              {capture ? (
                <div className="grid max-w-xl gap-4">
                  <ProgressRows capture={capture} />
                  {capture.status === "failed" ? (
                    <p className="flex gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-strong">
                      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                      {capture.reason ?? "Your website could not be read."} Carry on: you can fill in the details on the Confirm step.
                    </p>
                  ) : reading ? (
                    <p className="text-sm text-muted-foreground">You can carry on while it reads. Everything it finds waits for you on the Confirm step.</p>
                  ) : null}
                </div>
              ) : (
                <button type="button" className="justify-self-start text-sm text-muted-foreground underline-offset-4 hover:text-strong hover:underline" disabled={busy} onClick={() => void act(actions.skipWebsite, "That did not save.")}>
                  I don&apos;t have a website yet
                </button>
              )}
              <div className="lg:hidden">
                <LivePreview capture={capture} />
              </div>
            </>
          ) : null}

          {data.stage === "connect" ? (
            <>
              <Question eyebrow="Connect" title="Give Strategist more to work with" detail="Each account adds real numbers to your first research and offer ideas. All are read-only, and every one is optional." />
              <ul className="grid gap-3 sm:grid-cols-2">
                {connect.map((card) =>
                  // HighLevel brings its own card (the HighLevel connection's slot), shown in its place when given.
                  card.kind === "crm" && crm ? (
                    <li key={card.key} className="sm:col-span-2">
                      {crm}
                    </li>
                  ) : (
                    <ConnectTile key={card.key} card={card} busy={busy} onConnect={() => void act(() => actions.connect(card.key), "That could not be connected.")} />
                  ),
                )}
              </ul>
              {upload}
            </>
          ) : null}

          {data.stage === "confirm" ? (
            <>
              <Question eyebrow="Confirm" title="Check what we found" detail="Correct anything that is wrong. Each item says where it came from; anything the site did not say is marked as missing, never guessed." />
              <section className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-6">
                <h2 className="font-heading text-base text-strong">Your business</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Business name" htmlFor="c-name">
                    <Input id="c-name" value={business.name} onChange={(event) => setBusiness({ ...business, name: event.target.value })} />
                  </Field>
                  <Field label="Your name" htmlFor="c-person">
                    <Input id="c-person" value={person.fullName} onChange={(event) => setPerson({ ...person, fullName: event.target.value })} autoComplete="name" />
                  </Field>
                  <Field label="What you sell" htmlFor="c-offer">
                    <Textarea id="c-offer" value={business.offer} onChange={(event) => setBusiness({ ...business, offer: event.target.value })} rows={2} />
                  </Field>
                  <Field label="Who you serve" htmlFor="c-audience">
                    <Textarea id="c-audience" value={business.audience} onChange={(event) => setBusiness({ ...business, audience: event.target.value })} rows={2} />
                  </Field>
                  <Field label="Where you work" htmlFor="c-area" hint="a city, region or country">
                    <Input id="c-area" value={business.area} onChange={(event) => setBusiness({ ...business, area: event.target.value })} />
                  </Field>
                  <div className="grid gap-2">
                    <span className="text-sm font-medium text-strong">Your role</span>
                    <Chips label="Your role" options={ROLES.map((role) => ({ value: role, label: role }))} value={person.role} onPick={(role) => setPerson({ ...person, role })} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <span className="text-sm font-medium text-strong">Your main goal right now</span>
                  <Chips label="Main goal" options={data.goals.map((row) => ({ value: row.kind, label: row.label }))} value={goal.kind} onPick={(kind) => setGoal({ ...goal, kind })} />
                  <Input aria-label="In your words (optional)" placeholder="In your words (optional)" value={goal.text} onChange={(event) => setGoal({ ...goal, text: event.target.value })} />
                </div>
              </section>

              {capture?.result ? (
                <SiteCaptureView target="confirm" mode="confirm" capture={capture} quote={null} editor actions={{ start: async () => undefined, apply: async () => undefined }} choices={choices} onChoices={setChoices} />
              ) : (
                <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">{reading ? "Your website is still being read. What it finds will show here." : "Nothing was read from a website. Add your brand later in Settings › Brand."}</p>
              )}

              {readPages.length ? (
                <section className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:p-6">
                  <div className="grid gap-1">
                    <h2 className="font-heading text-base text-strong">Pages for your first teardown</h2>
                    <p className="text-sm text-muted-foreground">Strategist reviews up to five of your own pages against the landing page framework.</p>
                  </div>
                  <ul className="grid gap-2">
                    {readPages.map((page) => {
                      const on = teardown.includes(page.id);
                      return (
                        <li key={page.id}>
                          <label className="flex items-start gap-2.5 text-sm">
                            <Checkbox checked={on} disabled={!on && teardown.length >= 5} onCheckedChange={(next) => setTeardown((prior) => (next ? [...prior, page.id] : prior.filter((id) => id !== page.id)))} />
                            <span className="grid">
                              <span className="text-strong">{PAGE_KIND_WORDS[page.kind] ?? "Page"}</span>
                              <span className="truncate text-xs text-muted-foreground">{page.url.replace(/^https?:\/\//, "")}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              <section className="grid gap-2 rounded-xl border border-border bg-card p-4 sm:p-6">
                <h2 className="font-heading text-base text-strong">Connected</h2>
                <ul className="grid gap-1 text-sm">
                  {connect
                    .filter((card) => card.state !== "comingSoon")
                    .map((card) => (
                      <li key={card.key} className="flex justify-between gap-3">
                        <span className="text-strong">{card.name}</span>
                        <span className={card.state === "connected" ? "text-success-foreground" : "text-muted-foreground"}>{card.state === "connected" ? `Connected${card.label ? ` · ${card.label}` : ""}` : "Skipped"}</span>
                      </li>
                    ))}
                </ul>
              </section>

              <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm">
                <Switch checked={teamAccess} onCheckedChange={(next) => setTeamAccess(Boolean(next))} aria-label="Let the Vistrial service team help" />
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-1.5 font-medium text-strong">
                    <ShieldCheck aria-hidden className="size-4 text-primary" /> Let the Vistrial service team help
                  </span>
                  <span className="text-muted-foreground">Time-limited and logged. You can turn it off in Settings.</span>
                </span>
              </label>
            </>
          ) : null}
        </div>

        <footer className="sticky bottom-0 mt-10 flex flex-wrap items-center gap-3 border-t border-border/60 bg-background/90 py-4 backdrop-blur">
          {index > 0 ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void act(() => actions.goTo(STEPS[index - 1].stage as SetupStage), "That did not open.")}>
              <ChevronLeft aria-hidden /> Back
            </Button>
          ) : null}
          <div className="order-first w-full min-w-0 text-sm sm:order-none sm:w-auto sm:flex-1">
            {error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : missing ? (
              <p className="text-warning">{missing}</p>
            ) : null}
          </div>
          {data.stage === "website" ? (
            <Button size="lg" variant="gradient" disabled={busy || !homeDone} onClick={() => void act(() => actions.goTo("connect"), "That did not open.")} className="min-w-40">
              Continue <ArrowRight aria-hidden />
            </Button>
          ) : data.stage === "connect" ? (
            <Button size="lg" variant="gradient" disabled={busy} onClick={() => void act(() => actions.goTo("confirm"), "That did not open.")} className="min-w-40">
              {connect.some((card) => card.state === "connected") ? "Continue" : "Skip for now"} <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button
              size="lg"
              variant="gradient"
              disabled={busy || Boolean(missing)}
              className="min-w-40"
              onClick={() =>
                void act(
                  () =>
                    actions.confirm({
                      person,
                      business,
                      goal,
                      choices: capture?.result ? { take: [...choices.take], logoOwned: choices.logoOwned, edits: choices.edits } : undefined,
                      teardownPages: teardown,
                      serviceTeamAccess: teamAccess,
                    }),
                  "That did not save. Try again.",
                )
              }
            >
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden />}
              Looks right. Start.
            </Button>
          )}
        </footer>
      </section>

      <aside className="relative hidden border-l border-border/60 bg-muted/20 lg:block">
        <div className="sticky top-0 flex min-h-dvh items-center justify-center p-10 xl:p-14">
          <div className="w-full max-w-md">
            <LivePreview capture={capture} />
          </div>
        </div>
      </aside>
    </div>
  );
}
