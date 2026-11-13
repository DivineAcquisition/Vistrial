"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState, type ReactNode } from "react";

import { Check, CircleDashed, Globe, LoaderCircle, Quote, RefreshCw, TriangleAlert, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { BrandsTab } from "@/components/work/brands-tab";
import { useCredits } from "@/lib/credits";
import { showError } from "@/lib/errors/show-error";
import { bodyText, captionText, cardTitle, sectionTitle } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FIELD_WORDS, PAGE_KIND_WORDS, originWords, type CaptureResult, type Field, type FieldKey, type PageKind } from "../../../convex/lib/siteCapture/fields";

/** A capture as the screen gets it (convex/siteCapture.ts `view`). */
export type CaptureData = {
  id: string;
  url: string;
  status: "reading" | "understanding" | "done" | "partial" | "failed";
  progress: readonly { key: string; label: string; state: "done" | "active" | "waiting" | "failed" }[];
  pages: { id: string; url: string; kind: string; title: string; read: boolean; reason: string | null }[];
  result: CaptureResult | null;
  logoUrl: string | null;
  reason: string | null;
  free: boolean;
  appliedAt: number | null;
};

export type CaptureQuote = { free: boolean; maxCredits: number; canAfford: boolean; canStart: boolean };
export type CaptureEdits = { headingFont?: string; bodyFont?: string; tone?: string; audience?: string; location?: string };
export type CaptureActions = {
  start: (url: string) => Promise<unknown>;
  apply: (take: FieldKey[], logoOwned: boolean, edits: CaptureEdits) => Promise<unknown>;
};

const BRAND_KEYS: FieldKey[] = ["logo", "colors", "headingFont", "bodyFont", "tone"];
const BUSINESS_KEYS: FieldKey[] = ["name", "audience", "location"];
const EDITABLE: Partial<Record<FieldKey, keyof CaptureEdits>> = { headingFont: "headingFont", bodyFont: "bodyFont", tone: "tone", audience: "audience", location: "location" };

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Where a value came from, as a small chip. A quote, when there is one, is shown under the value. */
function Origin({ field, pages }: { field: Field<unknown>; pages: CaptureData["pages"] }) {
  const words = originWords(field, pages.map((page) => ({ id: page.id, kind: page.kind as PageKind })));
  const tone =
    field.origin === "missing"
      ? "border-warning/30 bg-warning/10 text-warning-foreground"
      : field.basis === "reading"
        ? "border-primary/25 bg-primary/10 text-primary"
        : "border-success/30 bg-success/10 text-success-foreground";
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", tone)}>{words}</span>;
}

function QuoteLine({ text }: { text: string | undefined }) {
  if (!text) return null;
  return (
    <p className="flex gap-1.5 text-xs text-muted-foreground">
      <Quote aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span className="italic">{text}</span>
    </p>
  );
}

function Row({ label, field, pages, take, onTake, children, disabled }: { label: string; field: Field<unknown>; pages: CaptureData["pages"]; take: boolean; onTake: (on: boolean) => void; children: ReactNode; disabled?: boolean }) {
  const missing = field.origin === "missing";
  return (
    <li className="grid gap-2 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-[10rem_1fr_auto] sm:items-start sm:gap-4">
      <div className="flex items-center gap-2">
        {missing ? (
          <CircleDashed aria-hidden className="size-4 text-muted-foreground" />
        ) : (
          <Checkbox aria-label={`Use ${label}`} checked={take} disabled={disabled} onCheckedChange={(next) => onTake(Boolean(next))} />
        )}
        <span className={cn("text-sm", missing ? "text-muted-foreground" : "text-card-foreground")}>{label}</span>
      </div>
      <div className="grid min-w-0 gap-1.5">{children}</div>
      <div className="sm:justify-self-end">
        <Origin field={field} pages={pages} />
      </div>
    </li>
  );
}

function ProgressList({ progress }: { progress: CaptureData["progress"] }) {
  return (
    <ol className="grid gap-2" aria-label="Reading your website">
      {progress.map((row) => (
        <li key={row.key} className="flex items-center gap-2.5 text-sm">
          {row.state === "done" ? (
            <Check aria-hidden className="size-4 text-success" />
          ) : row.state === "active" ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin text-primary" />
          ) : row.state === "failed" ? (
            <X aria-hidden className="size-4 text-destructive" />
          ) : (
            <CircleDashed aria-hidden className="size-4 text-muted-foreground" />
          )}
          <span className={row.state === "waiting" ? "text-muted-foreground" : "text-card-foreground"}>{row.label}</span>
        </li>
      ))}
    </ol>
  );
}

function PagesFound({ pages }: { pages: CaptureData["pages"] }) {
  if (pages.length === 0) return null;
  return (
    <div className="grid gap-2">
      <h4 className={cardTitle}>Pages found</h4>
      <ul className="grid gap-1.5">
        {pages.map((page) => (
          <li key={page.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
            <span className="text-card-foreground">{PAGE_KIND_WORDS[page.kind as PageKind] ?? "Page"}</span>
            <a href={page.url} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate text-xs text-primary underline-offset-4 hover:underline">
              {page.url.replace(/^https?:\/\//, "")}
            </a>
            {page.reason ? <span className="w-full text-xs text-muted-foreground">{page.reason}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The fields worth using by default: everything the site supports. */
function defaultTake(result: CaptureResult | null): Set<FieldKey> {
  const take = new Set<FieldKey>();
  if (!result) return take;
  for (const key of [...BRAND_KEYS, ...BUSINESS_KEYS, "offers", "proof", "guarantees", "social"] as FieldKey[]) {
    if (key !== "logo" && result[key].origin !== "missing") take.add(key);
  }
  return take;
}

/**
 * Reading a website and using what it says: the address form, live progress while it reads, then every field
 * it found with where it came from, ticked to use. Nothing is used until "Use the ticked items". Plain data in,
 * so the story can show every state.
 */
export function SiteCaptureView({ target, capture, quote, actions, editor }: { target: string; capture: CaptureData | null; quote: CaptureQuote | null; actions: CaptureActions; editor: boolean }) {
  const credits = useCredits();
  const [url, setUrl] = useState(capture?.url.replace(/^https:\/\//, "").replace(/\/$/, "") ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [again, setAgain] = useState(false);
  const result = capture?.result ?? null;
  const [take, setTake] = useState<Set<FieldKey>>(() => defaultTake(result));
  const [logoOwned, setLogoOwned] = useState(false);
  const [edits, setEdits] = useState<CaptureEdits>({});
  const run = async (work: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      return true;
    } catch (error) {
      setProblem(showError(error, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const reading = capture && (capture.status === "reading" || capture.status === "understanding");
  const showForm = !capture || capture.status === "failed" || again;
  const price = quote ? (quote.free ? "Free: the first read of each website is on Vistrial." : `Uses up to ${credits.words(quote.maxCredits)}. Pages that cannot be read are not charged.`) : null;

  const form = (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void run(() => actions.start(url), "That website could not be read.").then((ok) => ok && setAgain(false));
      }}
    >
      <label htmlFor={`site-${target}`} className="text-sm text-card-foreground">
        Website
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id={`site-${target}`} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="yourbusiness.com" inputMode="url" autoComplete="url" disabled={!editor || busy} className="sm:max-w-sm" />
        <Button type="submit" disabled={!editor || busy || !url.trim() || (quote ? !quote.canAfford : false)}>
          {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Globe aria-hidden className="size-4" />}
          Read the website
        </Button>
      </div>
      {price ? <p className={captionText}>{price}</p> : null}
      {quote && !quote.canAfford ? <p className="text-xs text-destructive">Not enough credits to read this website. An Owner can add credits in Billing.</p> : null}
      <p className={captionText}>Vistrial reads the site the way a visitor would, as VistrialBot, and stays out of any page the site asks crawlers to skip.</p>
    </form>
  );

  const toggle = (key: FieldKey) => (on: boolean) =>
    setTake((prior) => {
      const next = new Set(prior);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const editOf = (key: FieldKey, fallback: string) => {
    const name = EDITABLE[key];
    return name ? (edits[name] ?? fallback) : fallback;
  };
  const editInput = (key: FieldKey, fallback: string, multiline = false) => {
    const name = EDITABLE[key];
    if (!name || !editor) return <span className="text-sm text-card-foreground">{fallback}</span>;
    const value = editOf(key, fallback);
    return multiline ? (
      <textarea
        aria-label={FIELD_WORDS[key].label}
        className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(event) => setEdits((prior) => ({ ...prior, [name]: event.target.value }))}
      />
    ) : (
      <Input aria-label={FIELD_WORDS[key].label} value={value} onChange={(event) => setEdits((prior) => ({ ...prior, [name]: event.target.value }))} />
    );
  };

  const missing = result ? (Object.keys(FIELD_WORDS) as FieldKey[]).filter((key) => result[key].origin === "missing") : [];

  return (
    <Panel as="section" className="grid gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <h3 className={sectionTitle}>Read from the website</h3>
          <p className={bodyText}>
            {capture ? (
              <>
                {hostOf(capture.url)} · {capture.status === "done" ? "Read" : capture.status === "partial" ? "Partly read" : capture.status === "failed" ? "Could not be read" : "Reading now"}
              </>
            ) : (
              "Give the website and Vistrial fills in the brand, offers and pages it finds. You choose what to use."
            )}
          </p>
        </div>
        {capture && !reading && !again && editor ? (
          <Button size="sm" variant="ghost" onClick={() => setAgain(true)}>
            <RefreshCw aria-hidden className="size-4" /> Read again
          </Button>
        ) : null}
      </div>

      {reading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <ProgressList progress={capture.progress} />
          <PagesFound pages={capture.pages.filter((page) => page.id !== "p1")} />
        </div>
      ) : null}

      {capture?.status === "failed" ? (
        <p className="flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-card-foreground">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          {capture.reason ?? "The website could not be read."} You can fill in your brand by hand below.
        </p>
      ) : null}

      {showForm ? form : null}

      {result && !reading && !again ? (
        <div className="grid gap-5">
          {capture?.status === "partial" ? <p className={captionText}>The words on the pages could not be read this time, so tone, offers and proof are missing. Read the site again to try.</p> : null}

          <div className="grid gap-1">
            <h4 className={cardTitle}>Brand</h4>
            <ul>
              <Row label="Logo" field={result.logo} pages={capture!.pages} take={take.has("logo")} onTake={toggle("logo")} disabled={!editor}>
                {capture?.logoUrl ? (
                  <div className="grid gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a stored file's short-lived link */}
                    <img src={capture.logoUrl} alt="Logo found on the website" className="h-12 w-auto max-w-40 rounded border border-border/60 bg-white object-contain p-1" />
                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={logoOwned}
                        disabled={!editor}
                        onCheckedChange={(next) => {
                          setLogoOwned(Boolean(next));
                          if (next) toggle("logo")(true);
                        }}
                      />
                      This is our logo and we may use it.
                    </label>
                  </div>
                ) : (
                  <span className={captionText}>{FIELD_WORDS.logo.missing}</span>
                )}
              </Row>
              <Row label="Colours" field={result.colors} pages={capture!.pages} take={take.has("colors")} onTake={toggle("colors")} disabled={!editor}>
                {result.colors.value?.length ? (
                  <ul className="flex flex-wrap gap-3">
                    {result.colors.value.map((color) => (
                      <li key={color.hex} className="flex items-center gap-2">
                        <span aria-hidden className="size-6 rounded-md border border-border/60" style={{ backgroundColor: color.hex }} />
                        <span className="grid text-xs">
                          <span className="font-mono text-card-foreground">{color.hex}</span>
                          <span className="text-muted-foreground">{color.label}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className={captionText}>{FIELD_WORDS.colors.missing}</span>
                )}
              </Row>
              {(["headingFont", "bodyFont"] as const).map((key) => (
                <Row key={key} label={FIELD_WORDS[key].label} field={result[key]} pages={capture!.pages} take={take.has(key)} onTake={toggle(key)} disabled={!editor}>
                  {result[key].value ? editInput(key, result[key].value!) : <span className={captionText}>{FIELD_WORDS[key].missing}</span>}
                </Row>
              ))}
              <Row label="Tone of voice" field={result.tone} pages={capture!.pages} take={take.has("tone")} onTake={toggle("tone")} disabled={!editor}>
                {result.tone.value ? (
                  <>
                    {editInput("tone", result.tone.value.text, true)}
                    {result.tone.value.quotes.map((quote) => (
                      <QuoteLine key={quote} text={quote} />
                    ))}
                  </>
                ) : (
                  <span className={captionText}>{FIELD_WORDS.tone.missing}</span>
                )}
              </Row>
            </ul>
          </div>

          <div className="grid gap-1">
            <h4 className={cardTitle}>Business</h4>
            <ul>
              {BUSINESS_KEYS.map((key) => {
                const field = result[key] as Field<string>;
                return (
                  <Row key={key} label={FIELD_WORDS[key].label} field={field} pages={capture!.pages} take={take.has(key)} onTake={toggle(key)} disabled={!editor || key === "name"}>
                    {field.value ? (
                      <>
                        {editInput(key, field.value)}
                        <QuoteLine text={field.sources[0]?.quote} />
                      </>
                    ) : (
                      <span className={captionText}>{FIELD_WORDS[key].missing}</span>
                    )}
                  </Row>
                );
              })}
            </ul>
          </div>

          <div className="grid gap-1">
            <h4 className={cardTitle}>Offers and prices</h4>
            <ul>
              <Row label="Offers" field={result.offers} pages={capture!.pages} take={take.has("offers")} onTake={toggle("offers")} disabled={!editor}>
                {result.offers.value?.length ? (
                  <ul className="grid gap-2">
                    {result.offers.value.map((offer) => (
                      <li key={offer.name} className="grid gap-0.5">
                        <span className="text-sm text-card-foreground">
                          {offer.name} <span className="text-muted-foreground">· {offer.price || "No price stated"}</span>
                        </span>
                        {offer.included.length ? <span className={captionText}>Includes: {offer.included.join(", ")}</span> : null}
                        <QuoteLine text={offer.quote} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className={captionText}>{FIELD_WORDS.offers.missing}</span>
                )}
              </Row>
            </ul>
          </div>

          <div className="grid gap-1">
            <h4 className={cardTitle}>Proof, guarantees and links</h4>
            <ul>
              {(["proof", "guarantees"] as const).map((key) => (
                <Row key={key} label={FIELD_WORDS[key].label} field={result[key]} pages={capture!.pages} take={take.has(key)} onTake={toggle(key)} disabled={!editor}>
                  {result[key].value?.length ? (
                    <ul className="grid gap-1.5">
                      {result[key].value!.map((item) => (
                        <li key={item.quote} className="grid gap-0.5">
                          <span className="text-sm text-card-foreground">{item.text}</span>
                          <QuoteLine text={item.quote} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className={captionText}>{FIELD_WORDS[key].missing}</span>
                  )}
                </Row>
              ))}
              <Row label="Social links" field={result.social} pages={capture!.pages} take={take.has("social")} onTake={toggle("social")} disabled={!editor}>
                {result.social.value?.length ? (
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {result.social.value.map((row) => (
                      <a key={row.url} href={row.url} target="_blank" rel="noreferrer noopener" className="text-primary underline-offset-4 hover:underline">
                        {row.host}
                      </a>
                    ))}
                  </span>
                ) : (
                  <span className={captionText}>{FIELD_WORDS.social.missing}</span>
                )}
              </Row>
            </ul>
          </div>

          <PagesFound pages={capture!.pages} />

          {missing.length ? (
            <div className="grid gap-1.5 rounded-md border border-border/60 bg-muted/30 p-3">
              <h4 className={cardTitle}>Not on the website</h4>
              <ul className="grid gap-1 text-xs text-muted-foreground">
                {missing.map((key) => (
                  <li key={key}>{FIELD_WORDS[key].missing}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {editor ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                disabled={busy || take.size === 0 || (take.has("logo") && !logoOwned)}
                onClick={() => {
                  const typed: CaptureEdits = {};
                  for (const [key, value] of Object.entries(edits) as [keyof CaptureEdits, string][]) if (value.trim()) typed[key] = value.trim();
                  void run(() => actions.apply([...take], logoOwned, typed), "That was not saved.");
                }}
              >
                {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
                Use the ticked items
              </Button>
              <p className={captionText}>
                {capture?.appliedAt ? "Used before. Using it again adds a new version of the brand; nothing is overwritten." : "Adds a new version of the brand kit and offer cards. Anything you typed yourself is kept."}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
    </Panel>
  );
}

/** The capture panel for one target (the organization or a client), wired to Convex. */
function WiredCapture({ workspaceId, clientId, editor, target }: { workspaceId: Id<"workspaces">; clientId: Id<"clients"> | undefined; editor: boolean; target: string }) {
  const capture = useQuery(api.siteCapture.latest, { workspaceId, ...(clientId ? { clientId } : {}) });
  const quote = useQuery(api.siteCapture.quote, { workspaceId, ...(clientId ? { clientId } : {}) });
  const start = useMutation(api.siteCapture.start);
  const apply = useMutation(api.siteCapture.apply);
  if (capture === undefined) return <Panel className="h-40 animate-pulse p-4">{null}</Panel>;
  return (
    <SiteCaptureView
      // A different capture, or the same one finishing, starts the choices afresh.
      key={`${target}:${capture?.id ?? "none"}:${capture?.status ?? ""}`}
      target={target}
      capture={capture as CaptureData | null}
      quote={quote ?? null}
      editor={editor && (quote?.canStart ?? false)}
      actions={{
        start: (url) => start({ workspaceId, url, ...(clientId ? { clientId } : {}) }),
        apply: (take, logoOwned, edits) => apply({ workspaceId, captureId: capture!.id as Id<"siteCaptures">, take, logoOwned, edits }),
      }}
    />
  );
}

/** Settings › Brand: whose brand (the organization's or a client's), what its website says, and the brand kits. */
export function BrandSection({ workspaceId, editor }: { workspaceId: Id<"workspaces">; editor: boolean }) {
  const clients = useQuery(api.clients.list, { workspaceId });
  const [target, setTarget] = useState<string>("own");
  const businessClients = useMemo(() => (clients?.clients ?? []).filter((row) => row.type === "business"), [clients]);
  const ownWork = clients?.ownWork ?? true;
  const chosen = target === "own" ? (ownWork ? "own" : (businessClients[0]?.id ?? "own")) : target;
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <p className={bodyText}>The brand every creative is made with: your own, and one for each client. Read each website to fill it in, then change anything by hand.</p>
        {businessClients.length > 0 ? (
          <div role="tablist" aria-label="Whose brand" className="flex flex-wrap gap-2">
            {[...(ownWork ? [{ id: "own", name: "Your brand" }] : []), ...businessClients].map((row) => (
              <button
                key={row.id}
                type="button"
                role="tab"
                aria-selected={chosen === row.id}
                onClick={() => setTarget(row.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  chosen === row.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-card-foreground",
                )}
              >
                {row.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <WiredCapture workspaceId={workspaceId} clientId={chosen === "own" ? undefined : (chosen as Id<"clients">)} editor={editor} target={chosen} />
      <BrandsTab workspaceId={workspaceId} editor={editor} />
    </div>
  );
}
