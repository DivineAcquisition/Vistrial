"use client";

import { useClientScope } from "@/components/shell/shell-context";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState, type ReactNode } from "react";

import { BriefcaseBusiness, Building2, Check, PenLine, Plus, ShieldCheck, Trash2, Upload, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BRAND_KIND_WORDS,
  BRAND_MAX,
  EMPTY_BRAND,
  LOGO_VARIANTS,
  LOGO_VARIANT_WORDS,
  MAX_LOGO_BYTES,
  PLACEMENTS,
  PLACEMENT_WORDS,
  REGULATED,
  REGULATED_WORDS,
  STYLE_REFS_OWNED_WORDS,
  brandGaps,
  brandProblem,
  normalHex,
  type BrandContent,
  type BrandKind,
  type LogoVariant,
  type Placement,
  type Regulated,
} from "../../../convex/lib/brandKits";

import type { BrandKitFull, BrandKitRow } from "./types";
import { SectionTitle, WorkHero } from "./work-shell";

/** A logo in the editor: one the kit holds (with its link), or one just uploaded (with a local preview). */
type DraftLogo = { storageId: string; variant: LogoVariant; name: string; url: string | null };
type DraftRef = { storageId: string; name: string; url: string | null };
type Draft = Omit<BrandContent, "logos" | "styleRefs" | "useWords" | "avoidWords" | "examples" | "disclaimers" | "bannedTopics"> & {
  logos: DraftLogo[];
  styleRefs: DraftRef[];
  /** Lists are typed one per line. */
  useWords: string;
  avoidWords: string;
  examples: string;
  disclaimers: string;
  bannedTopics: string;
};

export type BrandSave = Omit<BrandContent, "logos" | "styleRefs"> & { logos: { storageId: string; variant: LogoVariant; name: string }[]; styleRefs: { storageId: string; name: string }[] };

export type BrandsTabProps = {
  editor: boolean;
  kits: BrandKitRow[];
  kit: BrandKitFull | null;
  onSelectKit: (kitId: string) => void;
  /** Saves a new version, or a new kit when `kitId` is null (then `kind` says whose brand it is). */
  onSave: (kitId: string | null, kind: BrandKind, content: BrandSave, note: string) => Promise<void>;
  onArchive: (kitId: string) => Promise<void>;
  /** Uploads one logo file and hands back where it is stored. */
  onUploadLogo: (file: File) => Promise<string>;
  /** Opens the editor straight away (stories). */
  initialEditing?: "new" | "edit" | null;
};

const lines = (value: string) => value.split("\n").map((row) => row.trim()).filter(Boolean);

function draftOf(content: Omit<BrandContent, "logos" | "styleRefs"> & { logos: (BrandContent["logos"][number] & { url?: string | null })[]; styleRefs: (BrandContent["styleRefs"][number] & { url?: string | null })[] }): Draft {
  return {
    ...content,
    logos: content.logos.map((logo) => ({ storageId: logo.storageId, variant: logo.variant, name: logo.name, url: logo.url ?? null })),
    styleRefs: content.styleRefs.map((ref) => ({ storageId: ref.storageId, name: ref.name, url: ref.url ?? null })),
    useWords: content.useWords.join("\n"),
    avoidWords: content.avoidWords.join("\n"),
    examples: content.examples.join("\n"),
    disclaimers: content.disclaimers.join("\n"),
    bannedTopics: content.bannedTopics.join("\n"),
  };
}

function saveOf(draft: Draft): BrandSave {
  return {
    ...draft,
    logos: draft.logos.map(({ storageId, variant, name }) => ({ storageId, variant, name })),
    styleRefs: draft.styleRefs.map(({ storageId, name }) => ({ storageId, name })),
    useWords: lines(draft.useWords),
    avoidWords: lines(draft.avoidWords),
    examples: lines(draft.examples),
    disclaimers: lines(draft.disclaimers),
    bannedTopics: lines(draft.bannedTopics),
  };
}

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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 rounded-2xl border border-border p-4">
      <legend className="px-1 font-heading text-sm text-card-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

function Swatches({ colors, size = "size-5" }: { colors: { label: string; hex: string }[]; size?: string }) {
  if (colors.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1" role="list" aria-label="Brand colours">
      {colors.map((color) => (
        <span key={color.hex} role="listitem" title={color.label ? `${color.label} ${color.hex}` : color.hex} aria-label={color.label ? `${color.label} ${color.hex}` : color.hex} className={cn("rounded-full border border-border", size)} style={{ backgroundColor: color.hex }} />
      ))}
    </span>
  );
}

/** The editor: every field of a kit on one page, saved as a new version. */
function BrandEditor({ initial, kind: startKind, editing, ownTaken, onCancel, onSave, onUploadLogo }: { initial: Draft; kind: BrandKind; editing: { name: string; nextVersion: number } | null; ownTaken: boolean; onCancel: () => void; onSave: (kind: BrandKind, content: BrandSave, note: string) => Promise<void>; onUploadLogo: (file: File) => Promise<string> }) {
  const [draft, setDraft] = useState(initial);
  const [kind, setKind] = useState<BrandKind>(startKind);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const addLogo = async (picked: File | undefined) => {
    if (!picked) return;
    if (picked.size > MAX_LOGO_BYTES) return setProblem("That logo file is over 5 MB.");
    if (draft.logos.length >= BRAND_MAX.logos) return setProblem(`Keep to ${BRAND_MAX.logos} logo files.`);
    setUploading(true);
    setProblem("");
    try {
      const storageId = await onUploadLogo(picked);
      const variant = LOGO_VARIANTS.find((row) => !draft.logos.some((logo) => logo.variant === row)) ?? "light";
      setDraft((current) => ({ ...current, logos: [...current.logos, { storageId, variant, name: picked.name, url: URL.createObjectURL(picked) }] }));
    } catch (error) {
      setProblem(showError(error, "The logo did not upload."));
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  };

  const refFile = useRef<HTMLInputElement>(null);
  const addRef = async (picked: File | undefined) => {
    if (!picked) return;
    if (picked.size > MAX_LOGO_BYTES) return setProblem("That example ad is over 5 MB.");
    if (draft.styleRefs.length >= BRAND_MAX.styleRefs) return setProblem(`Keep to ${BRAND_MAX.styleRefs} example ads.`);
    setUploading(true);
    setProblem("");
    try {
      const storageId = await onUploadLogo(picked);
      setDraft((current) => ({ ...current, styleRefs: [...current.styleRefs, { storageId, name: picked.name, url: URL.createObjectURL(picked) }] }));
    } catch (error) {
      setProblem(showError(error, "The example ad did not upload."));
    } finally {
      setUploading(false);
      if (refFile.current) refFile.current.value = "";
    }
  };

  const submit = async () => {
    const content = saveOf(draft);
    const wrong = brandProblem(content);
    if (wrong) return setProblem(wrong);
    setSaving(true);
    setProblem("");
    try {
      await onSave(kind, content, note);
    } catch (error) {
      setProblem(showError(error, "The brand did not save."));
      setSaving(false);
    }
  };

  return (
    <Panel as="section" className="grid gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base text-card-foreground">{editing ? `Edit ${editing.name}` : "Add a brand"}</h2>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          <X aria-hidden className="size-4" /> Cancel
        </Button>
      </div>

      <Group title="Who it is">
        {!editing ? (
          <div className="grid gap-1.5 text-sm">
            <span className="text-card-foreground">Whose brand is this?</span>
            <SegmentedRadioGroup
              aria-label="Whose brand is this?"
              value={kind}
              onValueChange={(value) => setKind(value as BrandKind)}
              options={[
                { value: "own", label: "My own business" },
                { value: "client", label: "A client" },
              ]}
            />
            {kind === "own" && ownTaken ? <span className="text-xs text-warning">You already have a kit for your own brand. Edit that one, or add this as a client.</span> : null}
          </div>
        ) : null}
        <Field label="Brand name">
          <Input value={draft.name} maxLength={BRAND_MAX.name} placeholder="Northside Dental" onChange={(event) => set("name", event.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Website" optional>
            <Input value={draft.website} maxLength={BRAND_MAX.website} inputMode="url" placeholder="https://northsidedental.com" onChange={(event) => set("website", event.target.value)} />
          </Field>
          <Field label="Industry" optional>
            <Input value={draft.industry} maxLength={BRAND_MAX.industry} placeholder="Family dentistry" onChange={(event) => set("industry", event.target.value)} />
          </Field>
        </div>
      </Group>

      <Group title="Logos">
        <p className="text-xs text-muted-foreground">Upload the real logo files. Vistrial places them on a creative as they are and never draws a logo itself.</p>
        {draft.logos.length > 0 ? (
          <ul className="grid gap-2">
            {draft.logos.map((logo, index) => (
              <li key={logo.storageId} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-2">
                <span className={cn("flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border", logo.variant === "dark" ? "bg-foreground" : "bg-background")}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a customer's file from storage, shown as uploaded */}
                  {logo.url ? <img src={logo.url} alt={`${draft.name || "Brand"} logo`} className="max-h-12 max-w-12 object-contain" /> : null}
                </span>
                <span className="min-w-0 flex-1 basis-32 truncate text-sm text-card-foreground">{logo.name}</span>
                <select
                  aria-label={`What ${logo.name} is for`}
                  value={logo.variant}
                  onChange={(event) => set("logos", draft.logos.map((row, at) => (at === index ? { ...row, variant: event.target.value as LogoVariant } : row)))}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
                >
                  {LOGO_VARIANTS.map((variant) => (
                    <option key={variant} value={variant}>
                      {LOGO_VARIANT_WORDS[variant]}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="ghost" aria-label={`Remove ${logo.name}`} onClick={() => set("logos", draft.logos.filter((_, at) => at !== index))}>
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" aria-label="Choose a logo file" onChange={(event) => void addLogo(event.target.files?.[0])} />
          <Button size="sm" variant="outline" disabled={uploading || draft.logos.length >= BRAND_MAX.logos} onClick={() => file.current?.click()}>
            <Upload aria-hidden className="size-4" /> {uploading ? "Uploading…" : "Upload a logo"}
          </Button>
          <span className="text-xs text-muted-foreground">PNG, JPG, WebP or SVG, up to 5 MB.</span>
        </div>
        {draft.logos.length > 0 ? (
          <label className="flex items-start gap-2 text-sm text-card-foreground">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={draft.logosOwned} onChange={(event) => set("logosOwned", event.target.checked)} />
            <span>This business owns these logos, or has the right to use them in its ads.</span>
          </label>
        ) : null}
      </Group>

      <Group title="Look">
        <div className="grid gap-2 text-sm">
          <span className="text-card-foreground">Colours</span>
          {draft.colors.map((color, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                aria-label={`Colour ${index + 1}`}
                value={/^#[0-9a-f]{6}$/.test(normalHex(color.hex)) ? normalHex(color.hex) : "#000000"}
                onChange={(event) => set("colors", draft.colors.map((row, at) => (at === index ? { ...row, hex: event.target.value } : row)))}
                className="size-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
              />
              <Input aria-label={`Colour ${index + 1} code`} className="w-28 shrink-0" value={color.hex} maxLength={7} placeholder="#1A2B3C" onChange={(event) => set("colors", draft.colors.map((row, at) => (at === index ? { ...row, hex: event.target.value } : row)))} />
              <Input aria-label={`Colour ${index + 1} name`} className="min-w-0 flex-1 basis-32" value={color.label} maxLength={BRAND_MAX.colorLabel} placeholder={["Main", "Accent", "Background", "Text"][index] ?? "Name"} onChange={(event) => set("colors", draft.colors.map((row, at) => (at === index ? { ...row, label: event.target.value } : row)))} />
              <Button size="sm" variant="ghost" aria-label={`Remove colour ${index + 1}`} onClick={() => set("colors", draft.colors.filter((_, at) => at !== index))}>
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </div>
          ))}
          {draft.colors.length < BRAND_MAX.colors ? (
            <div>
              <Button size="sm" variant="outline" onClick={() => set("colors", [...draft.colors, { label: "", hex: "#" }])}>
                <Plus aria-hidden className="size-4" /> Add a colour
              </Button>
            </div>
          ) : null}
        </div>
        <div className="grid gap-2 text-sm">
          <span className="flex flex-wrap items-baseline gap-x-2 text-card-foreground">
            Ads you have run <span className="text-xs text-muted-foreground">Optional</span>
          </span>
          <p className="text-xs text-muted-foreground">Up to {BRAND_MAX.styleRefs} of this brand&rsquo;s own ads. A designed ad follows their look: the layout, the weight of the type, the finish of the picture. Their words are never reused.</p>
          {draft.styleRefs.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {draft.styleRefs.map((ref, index) => (
                <li key={ref.storageId} className="relative size-24 overflow-hidden rounded-xl border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a customer's file from storage, shown as uploaded */}
                  {ref.url ? <img src={ref.url} alt={`Example ad ${index + 1}: ${ref.name}`} className="size-full object-cover" /> : null}
                  <button type="button" aria-label={`Remove example ad ${index + 1}`} onClick={() => set("styleRefs", draft.styleRefs.filter((_, at) => at !== index))} className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background text-foreground shadow">
                    <X aria-hidden className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <input ref={refFile} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose an example ad" onChange={(event) => void addRef(event.target.files?.[0])} />
            <Button size="sm" variant="outline" disabled={uploading || draft.styleRefs.length >= BRAND_MAX.styleRefs} onClick={() => refFile.current?.click()}>
              <Upload aria-hidden className="size-4" /> {uploading ? "Uploading…" : "Add an example ad"}
            </Button>
            <span className="text-xs text-muted-foreground">PNG, JPG or WebP, up to 5 MB.</span>
          </div>
          {draft.styleRefs.length > 0 ? (
            <label className="flex items-start gap-2 text-sm text-card-foreground">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={draft.styleRefsOwned} onChange={(event) => set("styleRefsOwned", event.target.checked)} />
              <span>{STYLE_REFS_OWNED_WORDS}</span>
            </label>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Heading font" optional>
            <Input value={draft.headingFont} maxLength={BRAND_MAX.font} placeholder="Poppins" onChange={(event) => set("headingFont", event.target.value)} />
          </Field>
          <Field label="Body font" optional>
            <Input value={draft.bodyFont} maxLength={BRAND_MAX.font} placeholder="Inter" onChange={(event) => set("bodyFont", event.target.value)} />
          </Field>
        </div>
        <Field label="Image style" optional hint="How photos and graphics should look.">
          <Textarea rows={2} value={draft.imageStyle} maxLength={BRAND_MAX.imageStyle} placeholder="Bright, natural light. Real people, no stock-photo poses. Lots of white space." onChange={(event) => set("imageStyle", event.target.value)} />
        </Field>
      </Group>

      <Group title="Voice">
        <Field label="Tone of voice" optional>
          <Textarea rows={2} value={draft.tone} maxLength={BRAND_MAX.tone} placeholder="Warm and plain-spoken. Short sentences. Never pushy." onChange={(event) => set("tone", event.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Words to use" optional hint="One per line.">
            <Textarea rows={3} value={draft.useWords} placeholder={"gentle\nsame-day"} onChange={(event) => set("useWords", event.target.value)} />
          </Field>
          <Field label="Words to avoid" optional hint="One per line.">
            <Textarea rows={3} value={draft.avoidWords} placeholder={"cheap\npainless"} onChange={(event) => set("avoidWords", event.target.value)} />
          </Field>
        </div>
        <Field label="Copy that worked" optional hint={`Up to ${BRAND_MAX.examples}, one per line. Past ads or posts in this brand's voice.`}>
          <Textarea rows={3} value={draft.examples} placeholder="Nervous about the dentist? So were most of our patients." onChange={(event) => set("examples", event.target.value)} />
        </Field>
      </Group>

      <Group title="Rules">
        <Field label="Is this a regulated field?" hint="Health and money claims get extra checks before a creative reaches you.">
          <select value={draft.regulated} onChange={(event) => set("regulated", event.target.value as Regulated)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm text-foreground">
            {REGULATED.map((value) => (
              <option key={value} value={value}>
                {REGULATED_WORDS[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Required disclaimers" optional hint="One per line. Added to every creative for this brand.">
          <Textarea rows={2} value={draft.disclaimers} placeholder="Results vary. Not a substitute for professional advice." onChange={(event) => set("disclaimers", event.target.value)} />
        </Field>
        <Field label="Topics to stay away from" optional hint="One per line.">
          <Textarea rows={2} value={draft.bannedTopics} placeholder="Competitor names" onChange={(event) => set("bannedTopics", event.target.value)} />
        </Field>
      </Group>

      <Group title="Placements">
        <p className="text-xs text-muted-foreground">The sizes this brand runs. A creative is made in each one you tick.</p>
        <div className="flex flex-wrap gap-2">
          {PLACEMENTS.map((placement) => {
            const on = draft.placements.includes(placement);
            return (
              <button
                key={placement}
                type="button"
                aria-pressed={on}
                onClick={() => set("placements", on ? draft.placements.filter((row) => row !== placement) : ([...draft.placements, placement] as Placement[]))}
                className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors", on ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground")}
              >
                {on ? <Check aria-hidden className="size-3.5" /> : null}
                {PLACEMENT_WORDS[placement]} <span className="text-xs text-muted-foreground">{placement}</span>
              </button>
            );
          })}
        </div>
      </Group>

      {editing ? (
        <Field label="What changed" optional>
          <Input value={note} maxLength={BRAND_MAX.note} placeholder="New logo after the rebrand" onChange={(event) => setNote(event.target.value)} />
        </Field>
      ) : null}
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={saving || uploading || (!editing && kind === "own" && ownTaken)} onClick={() => void submit()}>
          {saving ? "Saving…" : editing ? `Save as version ${editing.nextVersion}` : "Save brand"}
        </Button>
        <span className="text-xs text-muted-foreground">Nothing is overwritten. Each save is kept as a version.</span>
      </div>
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="min-w-0 text-sm text-card-foreground">{children}</dd>
    </div>
  );
}

const NONE = <span className="text-muted-foreground">Not set</span>;

/** One version of a kit, as a creative will read it. */
function BrandCard({ kind, version }: { kind: BrandKind; version: BrandKitFull["versions"][number] }) {
  const gaps = brandGaps(version);
  return (
    <Panel as="article" className="grid gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {BRAND_KIND_WORDS[kind]} · version {version.version} · {shortDate(version.createdAt)}
          </p>
          <h3 className="font-heading text-lg text-card-foreground">{version.name}</h3>
          {version.industry || version.website ? <p className="truncate text-sm text-muted-foreground">{[version.industry, version.website].filter(Boolean).join(" · ")}</p> : null}
        </div>
        {version.logos.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Logos">
            {version.logos.map((logo) => (
              <li key={logo.storageId} title={LOGO_VARIANT_WORDS[logo.variant]} className={cn("flex size-16 items-center justify-center overflow-hidden rounded-xl border border-border", logo.variant === "dark" ? "bg-foreground" : "bg-background")}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a customer's file from storage, shown as uploaded */}
                {logo.url ? <img src={logo.url} alt={`${version.name} logo, ${LOGO_VARIANT_WORDS[logo.variant].toLowerCase()}`} className="max-h-14 max-w-14 object-contain" /> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {gaps.length > 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
          Still missing: {gaps.join(", ")}. A creative can be made without them, but it will lean on defaults instead of this brand.
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-success">
          <ShieldCheck aria-hidden className="size-4" /> Ready for creative work.
        </p>
      )}
      <dl className="grid gap-3">
        <Row label="Colours">
          {version.colors.length > 0 ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {version.colors.map((color) => (
                <span key={color.hex} className="flex items-center gap-1.5">
                  <span aria-hidden className="size-4 rounded-full border border-border" style={{ backgroundColor: color.hex }} />
                  <span>{color.label || color.hex}</span>
                  {color.label ? <span className="text-xs text-muted-foreground">{color.hex}</span> : null}
                </span>
              ))}
            </span>
          ) : (
            NONE
          )}
        </Row>
        {version.styleRefs.length > 0 ? (
          <Row label="Ads you have run">
            <ul className="flex flex-wrap gap-2">
              {version.styleRefs.map((ref, index) => (
                <li key={ref.storageId} className="size-20 overflow-hidden rounded-lg border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a customer's file from storage, shown as uploaded */}
                  {ref.url ? <img src={ref.url} alt={`Example ad ${index + 1}`} className="size-full object-cover" /> : null}
                </li>
              ))}
            </ul>
          </Row>
        ) : null}
        <Row label="Fonts">{version.headingFont || version.bodyFont ? [version.headingFont && `${version.headingFont} for headings`, version.bodyFont && `${version.bodyFont} for body`].filter(Boolean).join(", ") : NONE}</Row>
        <Row label="Image style">{version.imageStyle || NONE}</Row>
        <Row label="Tone">{version.tone || NONE}</Row>
        {version.useWords.length > 0 ? <Row label="Use">{version.useWords.join(", ")}</Row> : null}
        {version.avoidWords.length > 0 ? <Row label="Avoid">{version.avoidWords.join(", ")}</Row> : null}
        {version.examples.length > 0 ? (
          <Row label="Copy that worked">
            <ul className="grid gap-1">
              {version.examples.map((example) => (
                <li key={example}>&ldquo;{example}&rdquo;</li>
              ))}
            </ul>
          </Row>
        ) : null}
        <Row label="Regulated">{REGULATED_WORDS[version.regulated]}</Row>
        {version.disclaimers.length > 0 ? <Row label="Disclaimers">{version.disclaimers.join(" ")}</Row> : null}
        {version.bannedTopics.length > 0 ? <Row label="Stay away from">{version.bannedTopics.join(", ")}</Row> : null}
        <Row label="Placements">{version.placements.length > 0 ? version.placements.map((placement) => `${PLACEMENT_WORDS[placement]} (${placement})`).join(", ") : NONE}</Row>
      </dl>
    </Panel>
  );
}

/** The Brands workspace: the kits, the chosen kit as a creative will read it, its versions, and the editor. */
export function BrandsTabView({ editor, kits, kit, onSelectKit, onSave, onArchive, onUploadLogo, initialEditing }: BrandsTabProps) {
  const [editing, setEditing] = useState<"new" | "edit" | null>(initialEditing ?? null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const versions = kit?.versions ?? [];
  const latest = versions.find((row) => row.version === kit?.currentVersion) ?? null;
  const shown = versions.find((row) => row.version === (viewing ?? kit?.currentVersion)) ?? latest;
  const ownTaken = kits.some((row) => row.kind === "own");

  const hero = (
    <WorkHero
      icon={BriefcaseBusiness}
      eyebrow="Brands"
      title="A brand kit for you and each client"
      promise="Every creative belongs to one brand and takes its logo, colours and voice from the kit. The look never comes from someone else's ad."
      action={
        editor && !editing ? (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus aria-hidden className="size-4" /> Add a brand
          </Button>
        ) : null
      }
    />
  );

  if (editing) {
    const edit = editing === "edit" && kit && latest ? { name: latest.name, nextVersion: Math.max(...versions.map((row) => row.version)) + 1 } : null;
    return (
      <div className="grid min-w-0 gap-5">
        {hero}
        <BrandEditor
          key={edit ? `edit-${kit?.id}` : "new"}
          initial={edit && latest ? draftOf(latest) : draftOf(EMPTY_BRAND)}
          kind={edit && kit ? kit.kind : ownTaken ? "client" : "own"}
          editing={edit}
          ownTaken={ownTaken}
          onCancel={() => setEditing(null)}
          onUploadLogo={onUploadLogo}
          onSave={(kind, content, note) =>
            onSave(edit ? (kit?.id ?? null) : null, kind, content, note).then(() => {
              setEditing(null);
              setViewing(null);
            })
          }
        />
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-5">
      {hero}
      <section className="grid gap-3" aria-label="Your brands">
        <SectionTitle icon={Building2}>Your brands</SectionTitle>
        {kits.length === 0 ? (
          <div className="grid justify-items-start gap-3 rounded-2xl border border-dashed border-border p-5">
            <div className="grid gap-1">
              <p className="text-sm text-card-foreground">No brand yet.</p>
              <p className="text-sm text-muted-foreground">Start with your own business: its logo, colours and how it talks. Then add one for each client you make creative for.</p>
            </div>
            {editor ? (
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus aria-hidden className="size-4" /> Add your brand
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {kits.map((row) => {
              const chosen = kit?.id === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => {
                      setViewing(null);
                      setConfirming(false);
                      onSelectKit(row.id);
                    }}
                    className={cn("flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors", chosen ? "border-primary" : "border-border hover:border-primary/40")}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background text-muted-foreground">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a customer's file from storage, shown as uploaded */}
                      {row.logoUrl ? <img src={row.logoUrl} alt="" className="max-h-9 max-w-9 object-contain" /> : <Building2 aria-hidden className="size-5" />}
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm text-card-foreground">{row.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {BRAND_KIND_WORDS[row.kind]}
                        {row.gaps.length > 0 ? ` · ${row.gaps.length} thing${row.gaps.length === 1 ? "" : "s"} missing` : " · ready"}
                      </span>
                    </span>
                    <Swatches colors={row.colors.slice(0, 4)} size="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {kit && shown ? (
        <section className="grid gap-3" aria-label={kit.name}>
          <BrandCard kind={kit.kind} version={shown} />
          {shown.version !== kit.currentVersion ? <p className="text-xs text-muted-foreground">You are looking at an earlier version. Creative work uses the newest, version {kit.currentVersion}.</p> : null}
          {editor ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing("edit")}>
                <PenLine aria-hidden className="size-4" /> Edit
              </Button>
              {confirming ? (
                <>
                  <span className="text-sm text-card-foreground">Put {kit.name} away? Its versions are kept.</span>
                  <Button size="sm" variant="destructive" onClick={() => void onArchive(kit.id).then(() => setConfirming(false), (error: unknown) => void showError(error, "The brand was not put away."))}>
                    Put away
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Keep
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                  <Trash2 aria-hidden className="size-4" /> Put away
                </Button>
              )}
            </div>
          ) : null}
          {versions.length > 1 ? (
            <div className="grid gap-2">
              <h3 className="text-xs tracking-wide text-muted-foreground uppercase">Versions</h3>
              <ul className="flex flex-wrap gap-1.5">
                {[...versions].reverse().map((row) => (
                  <li key={row.version}>
                    <button
                      type="button"
                      aria-pressed={shown.version === row.version}
                      title={row.note ?? undefined}
                      onClick={() => setViewing(row.version)}
                      className={cn("rounded-full border px-3 py-1 text-sm transition-colors", shown.version === row.version ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground")}
                    >
                      v{row.version} · {shortDate(row.createdAt)}
                      {row.note ? ` · ${row.note}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** The Brands tab fed by Convex. */
export function BrandsTab({ workspaceId, editor }: { workspaceId: Id<"workspaces">; editor: boolean }) {
  const { scope, clientId } = useClientScope();
  const kits = useQuery(api.brandKits.list, { workspaceId, scope });
  const [kitId, setKitId] = useState<string | null>(null);
  const chosen = (kits?.some((row) => row.id === kitId) ? kitId : (kits?.[0]?.id ?? null)) as Id<"brandKits"> | null;
  const kit = useQuery(api.brandKits.get, chosen ? { workspaceId, kitId: chosen } : "skip");
  const save = useMutation(api.brandKits.saveVersion);
  const archive = useMutation(api.brandKits.archive);
  const uploadUrl = useMutation(api.brandKits.logoUploadUrl);
  if (!kits) return <p className="text-sm text-muted-foreground">Loading brands.</p>;
  return (
    <BrandsTabView
      editor={editor}
      kits={kits}
      kit={kit ?? null}
      onSelectKit={setKitId}
      onSave={async (id, kind, content, note) => {
        const result = await save({ workspaceId, ...(id ? { kitId: id as Id<"brandKits"> } : { kind, ...(kind === "client" && clientId ? { clientId } : {}) }), ...content, note });
        setKitId(result.kitId);
      }}
      onArchive={async (id) => {
        await archive({ workspaceId, kitId: id as Id<"brandKits"> });
        setKitId(null);
      }}
      onUploadLogo={async (file) => {
        const url = await uploadUrl({ workspaceId });
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        if (!response.ok) throw new Error("upload failed");
        const body = (await response.json()) as { storageId: string };
        return body.storageId;
      }}
    />
  );
}
