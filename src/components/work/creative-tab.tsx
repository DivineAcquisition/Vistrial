"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

import { Check, Copy, FileText, LoaderCircle, Megaphone, Plus, ShieldCheck, Sparkles, Trash2, Upload, X } from "@/components/icons";
import { AssetStatusBadge } from "@/components/runs/run-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";
import { PLATFORM_LABEL, money, shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BRAND_KIND_WORDS } from "../../../convex/lib/brandKits";
import { ATTEST_WORDS, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, readReferenceLink } from "../../../convex/lib/referenceShapes";

import { CreativeImages } from "./creative-images";
import { CreativeTest, type TestActions } from "./creative-test";
import { ReviewBar } from "./review-bar";
import type { AddedReference, CreativeOptions, CreativeTabData, CreativeView, ReviewActions } from "./types";
import { useReviewActions } from "./use-review";
import { SectionTitle, WorkHero } from "./work-shell";

export type CreativeStart = { kitId: string; sourceRefId: string | null; referenceId: string | null; offerCardId: string | null; dial: string; note: string };

/** Adding a reference of one's own. Each returns words when it was refused, or null when the breakdown started. */
export type ReferenceActions = {
  addLink: (url: string) => Promise<string | null>;
  upload: (file: File) => Promise<string | null>;
  remove: (referenceId: string) => Promise<void>;
};

export type CreativeTabProps = {
  base: string;
  editor: boolean;
  options: CreativeOptions;
  /** References the person added themselves, newest first. */
  references: AddedReference[];
  referenceActions: ReferenceActions;
  tab: CreativeTabData;
  view: CreativeView | null;
  onSelect: (assetId: string) => void;
  onStart: (start: CreativeStart) => Promise<void>;
  review: ReviewActions;
  /** The reference picked with "Make our version" on the research board. Opens the form with it chosen. */
  initialSource?: string | null;
  /** Opens the form straight away (stories). */
  initialForm?: boolean;
  /** The images of the ad set that is open, drawn under its copy. */
  images?: ReactNode;
  /** Marking the open ad set as running and recording which variation won. */
  test: TestActions;
};

/** Why a run ended with nothing to review, in plain words. The run's own page has the step that failed. */
const STOP_WORDS: Record<string, string> = {
  cap: "it reached its cost or time limit.",
  error: "a step could not finish.",
  cancelled: "it was stopped.",
  halted: "it was stopped.",
  done: "it finished without a result.",
};

const NEVER = "Only the structure of a reference is followed. Its wording, footage, faces, voice, music and logos are never reused.";

function Pick({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={cn("flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors", on ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground")}
    >
      {on ? <Check aria-hidden className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

/** Add a reference of your own: a public YouTube link, or a video or image file. */
function AddReference({ actions }: { actions: ReferenceActions }) {
  const [url, setUrl] = useState("");
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState<"link" | "upload" | null>(null);
  const [problem, setProblem] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const run = async (kind: "link" | "upload", work: () => Promise<string | null>) => {
    setBusy(kind);
    setProblem("");
    try {
      const refused = await work();
      if (refused) setProblem(refused);
      else if (kind === "link") setUrl("");
    } catch (error) {
      setProblem(showError(error, "The reference was not added."));
    } finally {
      setBusy(null);
      if (file.current) file.current.value = "";
    }
  };

  const addLink = () => {
    // Checked here first, so a TikTok or Instagram link gets its answer without a round trip.
    const link = readReferenceLink(url);
    if (!link.ok) return setProblem(link.problem);
    void run("link", () => actions.addLink(url));
  };

  const pick = (picked: File | undefined) => {
    if (!picked) return;
    const video = picked.type.startsWith("video/");
    if (video && picked.size > MAX_VIDEO_BYTES) return setProblem("That video is over 14 MB. Export a smaller copy (720p is plenty) and upload that.");
    if (!video && picked.size > MAX_IMAGE_BYTES) return setProblem("That image is over 10 MB.");
    void run("upload", () => actions.upload(picked));
  };

  return (
    <div className="grid gap-3 rounded-xl border border-border p-3">
      <p className="text-sm text-card-foreground">Add an ad of your own to model</p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (url.trim()) addLink();
        }}
      >
        <label className="sr-only" htmlFor="reference-link">
          A public YouTube link
        </label>
        <Input id="reference-link" className="min-w-0 flex-1 basis-56" inputMode="url" value={url} placeholder="A public YouTube video or Short link" onChange={(event) => setUrl(event.target.value)} />
        <Button type="submit" size="sm" variant="outline" disabled={!url.trim() || busy !== null}>
          {busy === "link" ? "Adding…" : "Read this video"}
        </Button>
      </form>
      <div className="grid gap-2">
        <label className="flex items-start gap-2 text-sm text-card-foreground">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
          <span>{ATTEST_WORDS}</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={file} type="file" accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose a video or image file" onChange={(event) => pick(event.target.files?.[0])} />
          <Button type="button" size="sm" variant="outline" disabled={!attested || busy !== null} onClick={() => file.current?.click()}>
            <Upload aria-hidden className="size-4" /> {busy === "upload" ? "Uploading…" : "Upload a video or image"}
          </Button>
          <span className="text-xs text-muted-foreground">MP4, MOV or WebM up to 14 MB, or an image up to 10 MB.</span>
        </div>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        For TikTok, Instagram and ad libraries, upload the file: Vistrial does not take videos from those platforms. Your file is read once and then deleted; only the breakdown is kept. A read usually costs a few cents of credits.
      </p>
    </div>
  );
}

/** The ask: which brand, what to start from, and how closely to follow a reference. */
function StartForm({ base, options, references, referenceActions, initialSource, onCancel, onStart }: { base: string; options: CreativeOptions; references: AddedReference[]; referenceActions: ReferenceActions; initialSource: string | null; onCancel: () => void; onStart: (start: CreativeStart) => Promise<void> }) {
  const [kitId, setKitId] = useState<string | null>(options.kits.length === 1 ? options.kits[0].id : null);
  const [sourceRefId, setSourceRefId] = useState<string | null>(initialSource && options.sources.some((row) => row.id === initialSource) ? initialSource : null);
  const [picked, setPicked] = useState<string | null>(null);
  // A reference that was removed, or is not ready, is not a choice.
  const referenceId = references.some((row) => row.id === picked && row.status === "ready") ? picked : null;
  const [offerCardId, setOfferCardId] = useState<string | null>(null);
  const [dial, setDial] = useState("structure");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [starting, setStarting] = useState(false);
  const kit = options.kits.find((row) => row.id === kitId) ?? null;
  const chosenDial = options.dials.find((row) => row.value === dial);
  const ready = Boolean(kitId && (sourceRefId || referenceId || offerCardId));

  if (options.kits.length === 0) {
    return (
      <Panel as="section" className="grid justify-items-start gap-3 p-4 sm:p-6">
        <h2 className="font-heading text-base text-card-foreground">Add a brand first</h2>
        <p className="text-sm text-muted-foreground">Every creative is made for one brand and takes its voice and rules from the brand kit. Add your own brand, then come back.</p>
        <Link href={`${base}/work/brands`} className="text-sm text-primary underline-offset-4 hover:underline">
          Go to Brands
        </Link>
      </Panel>
    );
  }

  return (
    <Panel as="section" className="grid gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base text-card-foreground">Make a creative</h2>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={starting}>
          <X aria-hidden className="size-4" /> Cancel
        </Button>
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm text-card-foreground">1. Which brand is it for?</h3>
        <div className="flex flex-wrap gap-2">
          {options.kits.map((row) => (
            <Pick key={row.id} on={kitId === row.id} onClick={() => setKitId(row.id)}>
              {row.name} <span className="text-xs text-muted-foreground">{BRAND_KIND_WORDS[row.kind]}</span>
            </Pick>
          ))}
        </div>
        {kit && kit.gaps.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            This brand kit is still missing {kit.gaps.join(", ")}. The copy will lean on defaults for those.{" "}
            <Link href={`${base}/work/brands`} className="text-primary underline-offset-4 hover:underline">
              Finish the kit
            </Link>
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm text-card-foreground">2. What should it start from?</h3>
        <p className="text-xs text-muted-foreground">Pick a reference ad, a saved offer, or both.</p>
        <AddReference actions={referenceActions} />
        {references.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="References you added">
            {references.map((row) => {
              const on = referenceId === row.id;
              const usable = row.status === "ready";
              return (
                <li key={row.id} className={cn("grid gap-1 rounded-xl border bg-card p-3", on ? "border-primary" : "border-border")}>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      {row.origin === "upload" ? "Your file" : (PLATFORM_LABEL[row.platform] ?? row.platform)}
                      {row.breakdown?.advertiser ? ` · ${row.breakdown.advertiser}` : ""}
                    </span>
                    <Button size="sm" variant="ghost" aria-label={`Remove ${row.title}`} onClick={() => void referenceActions.remove(row.id).catch((error: unknown) => void showError(error, "It was not removed."))}>
                      <Trash2 aria-hidden className="size-3.5" />
                    </Button>
                  </div>
                  <p className="line-clamp-2 text-sm text-card-foreground">{row.title}</p>
                  {row.status === "analysing" ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <LoaderCircle aria-hidden className="size-3.5 animate-spin text-primary motion-reduce:animate-none" /> Reading it. This takes up to a minute.
                    </p>
                  ) : null}
                  {row.status === "failed" ? <p className="text-xs text-destructive">{row.problem}</p> : null}
                  {usable && row.breakdown ? (
                    <>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        Hook: {row.breakdown.hook.type || "not clear"}
                        {row.breakdown.format ? ` · ${row.breakdown.format}` : ""}
                        {row.breakdown.lengthSeconds ? ` · ${row.breakdown.lengthSeconds}s` : ""}
                      </p>
                      {row.breakdown.beats.length > 0 ? <p className="line-clamp-2 text-xs text-muted-foreground">Beats: {row.breakdown.beats.map((beat) => beat.what).join(" → ")}</p> : null}
                      <div>
                        <Pick
                          on={on}
                          onClick={() => {
                            setPicked(on ? null : row.id);
                            setSourceRefId(null);
                          }}
                        >
                          {on ? "Using this" : "Use this"}
                        </Pick>
                      </div>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {options.sources.length > 0 ? <p className="text-xs text-muted-foreground">Or pick one research already collected:</p> : null}
        {options.sources.length > 0 ? (
          <ul className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2" aria-label="Reference ads from your research">
            {options.sources.map((row) => {
              const on = sourceRefId === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setSourceRefId(on ? null : row.id);
                      setPicked(null);
                    }}
                    className={cn("grid w-full gap-1 rounded-xl border bg-card p-3 text-left transition-colors", on ? "border-primary" : "border-border hover:border-primary/40")}
                  >
                    <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">
                        {PLATFORM_LABEL[row.platform] ?? row.platform}
                        {row.publisher ? ` · ${row.publisher}` : ""}
                      </span>
                      {on ? <Check aria-hidden className="size-3.5 shrink-0 text-primary" /> : null}
                    </span>
                    <span className="line-clamp-2 text-sm text-card-foreground">{row.title}</span>
                    {row.hook ? <span className="line-clamp-1 text-xs text-muted-foreground">Hook: {row.hook}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Research also collects ads and videos: pick one on a research board with &ldquo;Make our version&rdquo;.</p>
        )}
        {options.offers.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Offer:</span>
            {options.offers.map((row) => (
              <Pick key={row.id} on={offerCardId === row.id} onClick={() => setOfferCardId(offerCardId === row.id ? null : row.id)}>
                {row.name}
              </Pick>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No saved offer yet.{" "}
            <Link href={`${base}/work/offers`} className="text-primary underline-offset-4 hover:underline">
              Build one in Offers
            </Link>{" "}
            so the ad can state its price and guarantee.
          </p>
        )}
      </div>

      {sourceRefId || referenceId ? (
        <div className="grid gap-2">
          <h3 className="text-sm text-card-foreground">3. How closely should it follow the reference?</h3>
          <SegmentedRadioGroup aria-label="How closely to follow the reference" value={dial} onValueChange={setDial} options={options.dials.map((row) => ({ value: row.value, label: row.label }))} />
          {chosenDial ? <p className="text-xs text-muted-foreground">{chosenDial.keeps}</p> : null}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" /> {NEVER}
          </p>
        </div>
      ) : null}

      <label className="grid gap-1.5 text-sm">
        <span className="flex flex-wrap items-baseline gap-x-2 text-card-foreground">
          Anything to steer it? <span className="text-xs text-muted-foreground">Optional</span>
        </span>
        <Textarea rows={2} maxLength={600} value={note} placeholder="Lead with the time it saves. Speak to first-time customers." onChange={(event) => setNote(event.target.value)} />
      </label>

      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!ready || starting}
          onClick={() => {
            if (!kitId) return;
            setStarting(true);
            setProblem("");
            void onStart({ kitId, sourceRefId, referenceId, offerCardId, dial, note }).catch((error: unknown) => {
              setProblem(showError(error, "The creative did not start."));
              setStarting(false);
            });
          }}
        >
          <Sparkles aria-hidden className="size-4" /> {starting ? "Starting…" : "Write the ad set"}
        </Button>
        <span className="text-xs text-muted-foreground">Writes a brief, four copy variations, a script and captions. Usually under $1 of credits. Nothing is published.</span>
      </div>
    </Panel>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={label}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => void showError(new Error("copy"), "Could not copy. Select the text and copy it by hand."),
        )
      }
    >
      {done ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />} {done ? "Copied" : "Copy"}
    </Button>
  );
}

/** One ad set: what it was made from, the checks, the brief, the four variations, the script and the captions. */
function AdSet({ view, editor, review, images, test }: { view: CreativeView; editor: boolean; review: ReviewActions; images?: ReactNode; test: TestActions }) {
  const creative = view.creative;
  const failed = view.checks.results.filter((row) => !row.passed);
  const waiting = view.status === "draft" || view.status === "needsReview";
  return (
    <Panel as="article" className="grid gap-5 p-4 sm:p-6">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 font-heading text-lg text-card-foreground">{view.title}</h3>
          <AssetStatusBadge status={view.status} />
        </div>
        <ul className="grid gap-1 text-sm text-muted-foreground">
          <li>
            Brand: <span className="text-card-foreground">{view.kit.name}</span> ({BRAND_KIND_WORDS[view.kit.kind]}, kit version {view.kit.version})
          </li>
          {view.offer ? (
            <li>
              Offer: <span className="text-card-foreground">{view.offer.name}</span> (version {view.offer.version})
            </li>
          ) : null}
          {view.reference ? (
            <li>
              Reference:{" "}
              {view.reference.url ? (
                <a href={view.reference.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                  {view.reference.title}
                </a>
              ) : (
                <span className="text-card-foreground">{view.reference.title} (a file you uploaded)</span>
              )}{" "}
              · {view.dial.label}. {view.dial.keeps}
            </li>
          ) : null}
        </ul>
        {view.reference ? (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" /> {NEVER}
          </p>
        ) : null}
      </div>

      {failed.length > 0 ? (
        <div className="grid gap-1 rounded-xl border border-warning/40 bg-warning/5 p-3">
          <p className="text-sm text-card-foreground">It did not pass every check:</p>
          <ul className="grid gap-1 text-sm text-muted-foreground">
            {failed.map((row) => (
              <li key={row.id}>
                <span className="text-card-foreground">{row.name}.</span> {row.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-success">
          <ShieldCheck aria-hidden className="size-4" /> Passed all {view.checks.results.length} checks: new wording, on brand, claims backed.
        </p>
      )}

      {!creative ? <p className="text-sm text-muted-foreground">The draft could not be written. Reject it and start again.</p> : null}
      {creative ? (
        <>
          <p className="text-sm text-card-foreground">{creative.summary}</p>
          <dl className="grid gap-2 rounded-xl border border-border p-3 text-sm sm:grid-cols-2">
            {(
              [
                ["For", creative.brief.audience],
                ["Promise", creative.brief.promise],
                ["Angle", creative.brief.angle],
                ["Tone", creative.brief.tone],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="grid gap-0.5">
                <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
                <dd className="text-card-foreground">{value || "Not stated"}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-3">
            <h4 className="text-xs tracking-wide text-muted-foreground uppercase">Four variations to test</h4>
            <ul className="grid gap-3 lg:grid-cols-2">
              {creative.variations.map((row) => (
                <li key={row.key} className="grid content-start gap-2 rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-card-foreground">
                      <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{row.key}</span>
                      {row.hookType}
                    </span>
                    <CopyButton label={`Copy variation ${row.key}`} text={[row.hook, row.primaryText, row.headline, row.cta, ...view.disclaimers].filter(Boolean).join("\n\n")} />
                  </div>
                  <p className="font-heading text-base text-card-foreground">{row.hook}</p>
                  <p className="text-sm whitespace-pre-line text-card-foreground">{row.primaryText}</p>
                  <p className="text-sm text-card-foreground">
                    <span className="text-muted-foreground">Headline:</span> {row.headline}
                  </p>
                  <p className="text-sm text-card-foreground">
                    <span className="text-muted-foreground">Button:</span> {row.cta}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-card-foreground">Image:</span> {row.imageDirection}
                  </p>
                  {row.design?.visual ? (
                    <p className="text-xs text-muted-foreground">
                      <span className="text-card-foreground">Designed ad:</span> {[row.design.eyebrow && `bar “${row.design.eyebrow}”`, row.design.kicker && `“${row.design.kicker}”`, row.design.visual, row.design.labels.length > 0 ? `labels: ${row.design.labels.join(", ")}` : "", row.design.subline && `“${row.design.subline}”`].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  <p className="rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground">
                    <span className="text-card-foreground">Untested hypothesis:</span> {row.hypothesis}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {creative.script.beats.length > 0 ? (
            <div className="grid gap-2">
              <h4 className="text-xs tracking-wide text-muted-foreground uppercase">Video script</h4>
              <ol className="grid gap-2">
                {creative.script.beats.map((beat, index) => (
                  <li key={index} className="grid gap-1 rounded-xl border border-border p-3 text-sm sm:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums">{beat.seconds}s</span>
                    <span className="text-card-foreground">{beat.voiceover}</span>
                    <span className="text-muted-foreground">On screen: {beat.onScreen || "nothing"}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {creative.captions.length > 0 ? (
            <div className="grid gap-2">
              <h4 className="text-xs tracking-wide text-muted-foreground uppercase">Captions for organic posts</h4>
              <ul className="grid gap-2">
                {creative.captions.map((caption, index) => (
                  <li key={index} className="flex items-start justify-between gap-2 rounded-xl border border-border p-3 text-sm text-card-foreground">
                    <span className="min-w-0">{caption}</span>
                    <CopyButton label={`Copy caption ${index + 1}`} text={caption} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {view.disclaimers.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              <span className="text-card-foreground">Required disclaimers, added when you copy a variation:</span> {view.disclaimers.join(" ")}
            </p>
          ) : null}
          {creative.claims.length > 0 ? (
            <div className="grid gap-1 text-xs text-muted-foreground">
              <span className="text-card-foreground">What the copy states as fact, and what backs it:</span>
              <ul className="grid gap-0.5">
                {creative.claims.map((claim, index) => (
                  <li key={index}>
                    &ldquo;{claim.text}&rdquo; · {claim.support === "offer" ? "your offer card" : "a fact you verified"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {creative.limits.length > 0 ? <p className="text-xs text-muted-foreground">Keep in mind: {creative.limits.join(" ")}</p> : null}
        </>
      ) : null}

      {creative && images ? <div className="border-t border-border pt-4">{images}</div> : null}

      {creative && (view.test || (editor && view.status === "approved")) ? (
        <div className="border-t border-border pt-4">
          <CreativeTest key={view.assetId} test={view.test} approved={view.status === "approved"} variations={creative.variations.map((row) => ({ key: row.key, hook: row.hook }))} editor={editor} actions={test} />
        </div>
      ) : null}

      <div className="grid gap-2 border-t border-border pt-4">
        {editor && waiting ? <ReviewBar assetId={view.assetId} actions={review} needsReview={view.status === "needsReview"} /> : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Link href={`/app/assets/${view.assetId}`} className="text-primary underline-offset-4 hover:underline">
            Open the full record with its evidence
          </Link>
          <span>Vistrial does not publish. When you upload, tick each platform&rsquo;s box for AI-made content.</span>
        </div>
      </div>
    </Panel>
  );
}

/** The Creative workspace: the ask, what is running, and the ad sets with the one chosen opened. */
export function CreativeTabView({ base, editor, options, references, referenceActions, tab, view, onSelect, onStart, review, initialSource, initialForm, images, test }: CreativeTabProps) {
  const [form, setForm] = useState(Boolean(initialForm || initialSource));
  return (
    <div className="grid min-w-0 gap-5">
      <WorkHero
        icon={Megaphone}
        eyebrow="Creative"
        title="Your own version of an ad that works"
        promise="Pick a brand and a reference ad or an offer. You get a brief, four copy variations to test, a script and captions, checked and waiting for your approval."
        action={
          editor && !form ? (
            <Button size="sm" onClick={() => setForm(true)}>
              <Plus aria-hidden className="size-4" /> Make a creative
            </Button>
          ) : null
        }
      />

      {form && editor ? <StartForm base={base} options={options} references={references} referenceActions={referenceActions} initialSource={initialSource ?? null} onCancel={() => setForm(false)} onStart={(start) => onStart(start).then(() => setForm(false))} /> : null}

      {tab.running.length > 0 ? (
        <section className="grid gap-3" aria-label="Running now">
          <SectionTitle icon={LoaderCircle}>Running now</SectionTitle>
          <ul className="grid gap-2">
            {tab.running.map((run) => (
              <li key={run.id}>
                <Link href={`/app/runs/${run.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm transition-colors hover:border-primary/40">
                  <span className="flex min-w-0 items-center gap-2 text-card-foreground">
                    <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
                    <span className="truncate">{run.words}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{money(run.costCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab.stopped.length > 0 ? (
        <ul className="grid gap-2" aria-label="Runs that stopped">
          {tab.stopped.map((run) => (
            <li key={run.id} className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              A run on {shortDate(run.startedAt)} stopped before it saved anything: {STOP_WORDS[run.stopReason ?? "error"] ?? STOP_WORDS.error}{" "}
              <Link href={`/app/runs/${run.id}`} className="text-primary underline-offset-4 hover:underline">
                See what happened
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="grid gap-3" aria-label="Ad sets">
        <SectionTitle icon={FileText}>Ad sets</SectionTitle>
        {tab.results.length === 0 ? (
          <div className="grid justify-items-start gap-3 rounded-2xl border border-dashed border-border p-5">
            <div className="grid gap-1">
              <p className="text-sm text-card-foreground">No ad set yet.</p>
              <p className="text-sm text-muted-foreground">Start from an ad on your research board with &ldquo;Make our version&rdquo;, or from a saved offer. {NEVER}</p>
            </div>
            {editor && !form ? (
              <Button size="sm" onClick={() => setForm(true)}>
                <Plus aria-hidden className="size-4" /> Make a creative
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-wrap gap-1.5" role="tablist" aria-label="Choose an ad set">
            {tab.results.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view?.assetId === row.id}
                  onClick={() => onSelect(row.id)}
                  className={cn("flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors", view?.assetId === row.id ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground")}
                >
                  <span className="truncate">
                    {row.brand} · {shortDate(row.createdAt)}
                  </span>
                  {row.status === "draft" || row.status === "needsReview" ? <span aria-label="Waiting for review" className="size-2 shrink-0 rounded-full bg-warning" /> : null}
                  {row.test === "due" ? <span className="shrink-0 text-xs text-warning">check-in due</span> : row.test === "running" ? <span className="shrink-0 text-xs text-muted-foreground">running</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        {view ? <AdSet view={view} editor={editor} review={review} images={images} test={test} /> : null}
      </section>
    </div>
  );
}

/** The Creative tab fed by Convex. `source` (from "Make our version") opens the form on that reference. */
export function CreativeTab({ workspaceId, base, editor, source }: { workspaceId: Id<"workspaces">; base: string; editor: boolean; source?: string | null }) {
  const options = useQuery(api.creative.options, { workspaceId, ...(source ? { sourceRefId: source as Id<"sourceRefs"> } : {}) });
  const tab = useQuery(api.creative.tab, { workspaceId });
  const [assetId, setAssetId] = useState<string | null>(null);
  const chosen = (tab?.results.some((row) => row.id === assetId) ? assetId : (tab?.results[0]?.id ?? null)) as Id<"assets"> | null;
  const view = useQuery(api.creative.view, chosen ? { workspaceId, assetId: chosen } : "skip");
  const references = useQuery(api.references.list, { workspaceId });
  const start = useMutation(api.creative.start);
  const addReference = useMutation(api.references.add);
  const referenceUploadUrl = useMutation(api.references.uploadUrl);
  const removeReference = useMutation(api.references.remove);
  const review = useReviewActions(workspaceId);
  const startTest = useMutation(api.creativeTests.start);
  const recordTest = useMutation(api.creativeTests.recordOutcome);
  const removeTest = useMutation(api.creativeTests.remove);
  if (!options || !tab) return <p className="text-sm text-muted-foreground">Loading creative.</p>;
  return (
    <CreativeTabView
      base={base}
      editor={editor}
      options={options}
      references={references ?? []}
      referenceActions={{
        addLink: async (url) => (await addReference({ workspaceId, url })).problem,
        // The tick beside the button is the person's word that they may submit the file.
        upload: async (file) => {
          const target = await referenceUploadUrl({ workspaceId });
          const response = await fetch(target, { method: "POST", headers: { "Content-Type": file.type }, body: file });
          if (!response.ok) throw new Error("upload failed");
          const body = (await response.json()) as { storageId: Id<"_storage"> };
          return (await addReference({ workspaceId, storageId: body.storageId, name: file.name, attested: true })).problem;
        },
        remove: async (referenceId) => {
          await removeReference({ workspaceId, referenceId: referenceId as Id<"creativeReferences"> });
        },
      }}
      tab={tab}
      view={view ?? null}
      onSelect={setAssetId}
      onStart={async (row) => {
        await start({
          workspaceId,
          kitId: row.kitId as Id<"brandKits">,
          ...(row.sourceRefId ? { sourceRefId: row.sourceRefId as Id<"sourceRefs"> } : {}),
          ...(row.referenceId ? { referenceId: row.referenceId as Id<"creativeReferences"> } : {}),
          ...(row.offerCardId ? { offerCardId: row.offerCardId as Id<"offerCards"> } : {}),
          dial: row.dial,
          note: row.note,
        });
        setAssetId(null);
      }}
      review={review}
      test={{
        start: async (checkInDays) => {
          if (chosen) await startTest({ workspaceId, assetId: chosen, checkInDays });
        },
        record: async (testId, result, winnerKey, note) => {
          await recordTest({ workspaceId, testId: testId as Id<"creativeTests">, result, ...(winnerKey ? { winnerKey } : {}), note });
        },
        remove: async (testId) => {
          await removeTest({ workspaceId, testId: testId as Id<"creativeTests"> });
        },
      }}
      initialSource={source ?? null}
      images={view?.creative ? <CreativeImages key={view.assetId} workspaceId={workspaceId} assetId={view.assetId} editor={editor} variations={view.creative.variations.map((row) => ({ key: row.key, headline: row.headline, cta: row.cta }))} /> : null}
    />
  );
}
