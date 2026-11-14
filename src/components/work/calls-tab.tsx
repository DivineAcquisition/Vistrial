"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { CalendarIcon, CheckCircle2, ExternalLink, Globe, CircleDashed, CircleSlash, ClipboardList, Hand, ListChecks, Loader2, MessageCircleQuestion, MessageSquareWarning, Quote, Target, TriangleAlert, User, Users, XCircle, type LucideIcon } from "@/components/icons";
import { EvidenceLabel } from "@/components/readable";
import { useClientScope } from "@/components/shell/shell-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { CallNotesForm, RecentNotes, type NotesActions, type NotesData } from "./call-notes";
import { ReviewView, type ReviewData, type ReviewsData } from "./review-view";
import { SectionTitle, WorkHero } from "./work-shell";

export type CallsData = FunctionReturnType<typeof api.dealBriefings.calls>;
export type BriefData = FunctionReturnType<typeof api.dealBriefings.brief>;
type Upcoming = CallsData["upcoming"][number];
type BriefState = NonNullable<Upcoming["brief"]>["state"];

export type CallsActions = {
  /** Asks for a brief on one booked call, or (without a CRM) on a lead by name. */
  /** Asks for a review of a held call: its transcript, its notes, or both. */
  requestReview?: (input: { transcriptId?: string; callNoteId?: string; confirmedCredits: number }) => Promise<unknown>;
  /** Saves the closer's notes after a call, the memo uploaded first. */
  saveNote?: NotesActions["saveNote"];
  request: (input: { contactRef?: string; dealRef?: string; appointmentRef?: string; leadName?: string; about?: string; handoff?: string; website?: string; confirmedCredits: number }) => Promise<unknown>;
};

/** Colour is never alone: every brief state has an icon and its words. */
const STATE: Record<BriefState | "none", { words: string; icon: LucideIcon; badge: "success" | "warning" | "outline" | "info" | "error" }> = {
  none: { words: "No brief yet", icon: CircleDashed, badge: "outline" },
  running: { words: "Being written", icon: Loader2, badge: "info" },
  ready: { words: "Brief ready", icon: CheckCircle2, badge: "success" },
  needsReview: { words: "Brief ready, needs a check", icon: TriangleAlert, badge: "warning" },
  failed: { words: "Could not be written", icon: XCircle, badge: "error" },
};

const CALL_WORDS: Record<string, string> = { booked: "Booked", confirmed: "Confirmed", showed: "Showed", noShow: "No-show", cancelled: "Cancelled", unknown: "Status unknown" };

async function run(action: () => Promise<unknown>) {
  try {
    await action();
    return true;
  } catch (error) {
    showError(error);
    return false;
  }
}

function StateBadge({ state, of = "brief" }: { state: BriefState | "none"; of?: "brief" | "review" }) {
  const look = STATE[state];
  const Icon = look.icon;
  return (
    <Badge variant={look.badge} size="sm">
      <Icon aria-hidden className={state === "running" ? "size-3 animate-spin" : "size-3"} />
      {of === "review" ? look.words.replace("Brief", "Review").replace("No brief yet", "No review yet") : look.words}
    </Badge>
  );
}

/** Asking for a brief: an optional hand-off, then the budget confirmed before anything runs. */
function AskBrief({ call, maxCredits, actions, onDone }: { call: Upcoming; maxCredits: number; actions: CallsActions; onDone: () => void }) {
  const [handoff, setHandoff] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <label className="grid gap-1 text-xs text-muted-foreground" htmlFor={`site-${call.ref}`}>
        Their business website (optional). Without it, Dealmaker reads the site at their work email&apos;s domain, if they have one.
        <Input id={`site-${call.ref}`} inputMode="url" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://their-business.com" />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground" htmlFor={`handoff-${call.ref}`}>
        What the setter found (optional). It is shown as their account, with their name.
        <Textarea id={`handoff-${call.ref}`} rows={3} value={handoff} onChange={(event) => setHandoff(event.target.value)} placeholder="Booked from the webinar. Wants more booked calls; partner signs off." />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await run(() => actions.request({ contactRef: call.contactRef, appointmentRef: call.ref, ...(call.dealRef ? { dealRef: call.dealRef } : {}), ...(handoff.trim() ? { handoff } : {}), ...(website.trim() ? { website } : {}), confirmedCredits: maxCredits }));
            setBusy(false);
            if (ok) onDone();
          }}
        >
          Make the brief
        </Button>
        <span className="text-xs text-muted-foreground">Up to {maxCredits} credits for this brief. Nothing runs until you press it.</span>
      </div>
    </div>
  );
}

function CallRow({ call, data, actions, notes, reviews, onOpen, onOpenReview }: { call: Upcoming; data: CallsData; actions: CallsActions; notes: NotesData | null; reviews: ReviewsData | null; onOpen: (id: string) => void; onOpenReview: (id: string) => void }) {
  const [asking, setAsking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noting, setNoting] = useState(false);
  const state = call.brief?.state ?? "none";
  const canAsk = data.canRequest && (state === "none" || state === "failed");
  return (
    <li className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-3" data-call={call.ref}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <span className="text-sm font-medium text-foreground">{call.leadName}</span>
          <span className="text-xs text-muted-foreground">
            {call.when} · {CALL_WORDS[call.status] ?? call.status}
            {call.stage ? ` · ${call.stage}` : ""}
            {call.source ? ` · ${call.source}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {call.past && !call.brief ? null : <StateBadge state={state} />}
          {call.brief && (state === "ready" || state === "needsReview") ? (
            <Button size="sm" variant="outline" onClick={() => onOpen(call.brief!.id)}>
              Open the brief
            </Button>
          ) : canAsk && !asking && !call.past ? (
            <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
              Make a brief
            </Button>
          ) : null}
          {call.past ? (
            call.noted ? (
              <Badge variant="success" size="sm">
                <CheckCircle2 aria-hidden className="size-3" />
                Notes added
              </Badge>
            ) : notes?.canWrite && actions.saveNote && !noting ? (
              <Button size="sm" variant="outline" onClick={() => setNoting(true)}>
                Add call notes
              </Button>
            ) : null
          ) : null}
          {call.past && call.review && (call.review.state === "ready" || call.review.state === "needsReview") ? (
            <Button size="sm" variant="outline" onClick={() => onOpenReview(call.review!.id)}>
              Open the review
            </Button>
          ) : call.past && call.review?.state === "running" ? (
            <StateBadge state="running" of="review" />
          ) : call.past && (call.transcriptId || call.callNoteId) && reviews?.canRequest && actions.requestReview && !reviewing ? (
            <Button size="sm" variant="outline" onClick={() => setReviewing(true)}>
              Review this call
            </Button>
          ) : null}
        </div>
      </div>
      {reviewing && reviews && actions.requestReview ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <span className="text-xs text-muted-foreground">
            Reviews {call.transcriptId ? "the call's transcript" : ""}
            {call.transcriptId && call.callNoteId ? " and " : ""}
            {call.callNoteId ? "your notes" : ""}. Up to {reviews.maxCredits} credits. Anything it suggests waits for a person.
          </span>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await run(() => actions.requestReview!({ ...(call.transcriptId ? { transcriptId: call.transcriptId } : {}), ...(call.callNoteId ? { callNoteId: call.callNoteId } : {}), confirmedCredits: reviews.maxCredits }));
              setBusy(false);
              if (ok) setReviewing(false);
            }}
          >
            Review it
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setReviewing(false)}>
            Cancel
          </Button>
        </div>
      ) : null}
      {asking ? <AskBrief call={call} maxCredits={data.maxCredits} actions={actions} onDone={() => setAsking(false)} /> : null}
      {noting && notes && actions.saveNote ? (
        <CallNotesForm lead={{ contactRef: call.contactRef, dealRef: call.dealRef, appointmentRef: call.ref, leadName: call.leadName }} options={notes} actions={{ saveNote: actions.saveNote }} onDone={() => setNoting(false)} />
      ) : null}
    </li>
  );
}

/** With no CRM, notes after a call start from who it was with. */
function NotesByName({ notes, saveNote }: { notes: NotesData; saveNote: NotesActions["saveNote"] }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel className="grid min-w-0 gap-3 p-4 sm:p-6">
      <SectionTitle icon={ClipboardList}>Notes after a call</SectionTitle>
      {open ? (
        <CallNotesForm lead={{ leadName: "this lead", askName: true }} options={notes} actions={{ saveNote }} onDone={() => setOpen(false)} />
      ) : (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setOpen(true)}>
          Add call notes
        </Button>
      )}
    </Panel>
  );
}

/** With no CRM, a brief starts from who the lead is and what the person knows (answer 12.8). */
function BriefByName({ data, actions }: { data: CallsData; actions: CallsActions }) {
  const [leadName, setLeadName] = useState("");
  const [about, setAbout] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Panel className="grid min-w-0 gap-3 p-4 sm:p-6">
      <SectionTitle icon={User}>Brief a lead by name</SectionTitle>
      <p className="text-sm text-muted-foreground">No CRM is connected here, so Dealmaker works from what you write and any call linked to this lead. Connect your CRM in Connections and every booked call shows here.</p>
      {data.canRequest ? (
        <div className="grid gap-2">
          <Input aria-label="The lead's name" value={leadName} onChange={(event) => setLeadName(event.target.value)} placeholder="Jordan Lee" />
          <Textarea aria-label="What you know about them" rows={3} value={about} onChange={(event) => setAbout(event.target.value)} placeholder="Runs a three-person agency; wants more booked calls." />
          <Input aria-label="Their business website (optional)" inputMode="url" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="Their business website (optional)" />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy || !leadName.trim() || !about.trim()}
              onClick={async () => {
                setBusy(true);
                const ok = await run(() => actions.request({ leadName, about, ...(website.trim() ? { website } : {}), confirmedCredits: data.maxCredits }));
                setBusy(false);
                if (ok) {
                  setLeadName("");
                  setAbout("");
                  setWebsite("");
                }
              }}
            >
              Make the brief
            </Button>
            <span className="text-xs text-muted-foreground">Up to {data.maxCredits} credits for this brief.</span>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function Block({ icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 gap-2">
      <SectionTitle icon={icon}>{title}</SectionTitle>
      {children}
    </section>
  );
}

/** One brief, built from its saved view: every line keeps the evidence label code gave it. */
export function BriefView({ brief, onClose }: { brief: BriefData; onClose?: () => void }) {
  const view = brief.view;
  if (!view) return <p className="text-sm text-muted-foreground">{brief.state === "running" ? "Dealmaker is writing this brief." : "This brief could not be written."}</p>;
  const who = view.facts.filter((row) => row.group === "who");
  const soFar = view.facts.filter((row) => row.group === "soFar");
  return (
    <Panel className="grid min-w-0 gap-5 p-4 sm:p-6" data-brief={brief.id}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1">
          <p className="text-xs font-medium text-muted-foreground">Dealmaker · pre-call brief</p>
          <h2 className="font-heading text-lg text-foreground">
            {brief.leadName}
            {brief.when ? <span className="text-muted-foreground">, {brief.when}</span> : null}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <StateBadge state={brief.state} />
          {onClose ? (
            <Button size="sm" variant="ghost" onClick={onClose}>
              Back to calls
            </Button>
          ) : null}
        </div>
      </div>
      {view.summary ? (
        <div className="grid gap-1.5">
          <p className="text-sm text-foreground">{view.summary}</p>
          <EvidenceLabel label="Inference" />
        </div>
      ) : null}
      {view.firstCall ? <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">First call: nothing is on record beyond the booking. Use it to learn their need, budget, who decides and timing.</p> : null}

      <Block icon={User} title="Who">
        <ul className="flex flex-wrap gap-2" aria-label="Who">
          {who.map((row) => (
            <li key={row.label} className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
              <span className="text-muted-foreground">{row.label}: </span>
              <span className="text-foreground">{row.display}</span>
            </li>
          ))}
        </ul>
        {soFar.length ? (
          <ul className="grid gap-1 text-sm">
            {soFar.map((row) => (
              <li key={row.label} className="flex flex-wrap justify-between gap-2 border-b border-border pb-1">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="text-foreground">{row.display}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <EvidenceLabel label="Your data" /> As your CRM records it. Vistrial keeps no message words, so this is counts and dates.
        </span>
      </Block>

      {view.publicRead ? (
        <Block icon={Globe} title="Their business, in public">
          <ul className="grid gap-1.5 text-sm">
            {view.publicRead.lines.map((row, i) => (
              <li key={i} className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <span className="min-w-0 text-foreground">{row.text}</span>
                <a href={row.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2">
                  Source <ExternalLink aria-hidden className="size-3" />
                </a>
              </li>
            ))}
          </ul>
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <EvidenceLabel label="Observed" /> On {view.publicRead.domain}
            {view.publicRead.from === "email" ? ", the domain of their work email" : ""}: what the business says about itself.
          </span>
        </Block>
      ) : null}

      <Block icon={ListChecks} title="Readiness">
        <ul className="grid gap-2 sm:grid-cols-2">
          {view.readiness.map((row) => (
            <li key={row.field} className="grid min-w-0 gap-1 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{row.label}</span>
                {row.established ? (
                  <Badge variant="success" size="sm">
                    <CheckCircle2 aria-hidden className="size-3" />
                    Established
                  </Badge>
                ) : (
                  <Badge variant="outline" size="sm">
                    <CircleSlash aria-hidden className="size-3" />
                    Unresolved
                  </Badge>
                )}
              </div>
              {row.established ? (
                <>
                  <p className="text-sm text-foreground">{row.finding}</p>
                  <p className="text-xs break-words text-muted-foreground">
                    {row.kind}, {row.source}: &ldquo;{row.quote}&rdquo;
                  </p>
                </>
              ) : (
                <EvidenceLabel label="Not enough data" />
              )}
            </li>
          ))}
        </ul>
      </Block>

      {view.handoff ? (
        <Block icon={Users} title="From the setter">
          <blockquote className="border-l-2 border-border pl-3 text-sm whitespace-pre-line text-foreground">{view.handoff.text}</blockquote>
          <p className="text-xs text-muted-foreground">Rep&apos;s account, {view.handoff.by}. Not a recorded event.</p>
        </Block>
      ) : null}

      {view.commitments.length ? (
        <Block icon={Hand} title="Open commitments">
          <ul className="grid gap-1.5 text-sm">
            {view.commitments.map((row, i) => (
              <li key={i} className="grid gap-0.5 rounded-md bg-muted/40 px-3 py-2">
                <span className="text-foreground">
                  <span className="font-medium">{row.owner}:</span> {row.what}
                  {row.due ? <span className="text-muted-foreground"> · by {row.due}</span> : null}
                </span>
                <span className="text-xs break-words text-muted-foreground">&ldquo;{row.quote}&rdquo;</span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {view.disagreements.length ? (
        <Block icon={MessageSquareWarning} title="Records that disagree">
          <p className="text-xs text-muted-foreground">Dealmaker does not pick one. Check with the person who knows.</p>
          <ul className="grid gap-1 text-sm text-foreground">
            {view.disagreements.map((row, i) => (
              <li key={i}>{row}</li>
            ))}
          </ul>
        </Block>
      ) : null}

      {view.cover.length ? (
        <Block icon={ClipboardList} title="Cover on this call">
          <ul className="grid gap-1.5">
            {view.cover.map((row, i) => (
              <li key={i} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-start gap-2 text-foreground">
                  <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {row.point}
                </span>
                <EvidenceLabel label={row.label} />
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {view.offerFit ? (
        <Block icon={Target} title="The package that fits">
          <p className="text-sm text-foreground">
            <span className="font-medium">{view.offerFit.title}.</span> {view.offerFit.why}
          </p>
          <EvidenceLabel label="Inference" />
        </Block>
      ) : null}

      {view.objections.length ? (
        <Block icon={Quote} title="Likely objections">
          <ul className="grid gap-2">
            {view.objections.map((row, i) => (
              <li key={i} className="grid gap-1 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-foreground">{row.text}</span>
                  <EvidenceLabel label={row.label} />
                </div>
                <span className="text-xs break-words text-muted-foreground">{row.where}</span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {view.openingQuestion ? (
        <Block icon={MessageCircleQuestion} title="Opening question">
          <p className="rounded-lg bg-primary/8 px-3 py-2 text-sm text-foreground">{view.openingQuestion}</p>
        </Block>
      ) : null}

      {view.missing.length ? (
        <Block icon={CircleSlash} title="What this brief could not read">
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {view.missing.map((row, i) => (
              <li key={i}>{row}</li>
            ))}
          </ul>
        </Block>
      ) : null}
    </Panel>
  );
}

/** The Calls tab before the call, with its data handed in, so a story can show it without a server. */
export function CallsView({
  data,
  actions,
  notes = null,
  reviews = null,
  open,
  onOpen,
  openReview,
  onOpenReview = () => undefined,
}: {
  data: CallsData;
  actions: CallsActions;
  notes?: NotesData | null;
  reviews?: ReviewsData | null;
  open?: BriefData | null;
  onOpen: (id: string | null) => void;
  openReview?: ReviewData | null;
  onOpenReview?: (id: string | null) => void;
}) {
  if (open) return <BriefView brief={open} onClose={() => onOpen(null)} />;
  if (openReview) return <ReviewView review={openReview} onClose={() => onOpenReview(null)} />;
  const others = data.recent.filter((row) => !data.upcoming.some((call) => call.brief?.id === row.id));
  return (
    <div className="grid min-w-0 gap-5">
      <WorkHero
        icon={CalendarIcon}
        agent="sales-conversion"
        eyebrow="Dealmaker · Calls"
        title="Before each call, one page on the lead; after it, the review"
        promise={`${data.scopeWhy} A brief reads your ${data.connected ? data.crm.label : "notes"}, the lead's earlier calls and your Playbook. It contacts nobody.`}
      />
      {data.connected ? (
        <Panel className="grid min-w-0 gap-3 p-4 sm:p-6">
          <SectionTitle icon={CalendarIcon}>Booked calls, the last two days and this week</SectionTitle>
          {data.upcoming.length ? (
            <ul className="grid gap-2">
              {data.upcoming.map((call) => (
                <CallRow key={call.ref} call={call} data={data} actions={actions} notes={notes} reviews={reviews} onOpen={onOpen} onOpenReview={onOpenReview} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No booked calls in the next 7 days.</p>
          )}
        </Panel>
      ) : (
        <>
          <BriefByName data={data} actions={actions} />
          {notes?.canWrite && actions.saveNote ? <NotesByName notes={notes} saveNote={actions.saveNote} /> : null}
        </>
      )}
      {notes ? <RecentNotes notes={notes.notes} /> : null}
      {reviews?.reviews.length ? (
        <Panel className="grid min-w-0 gap-3 p-4 sm:p-6">
          <SectionTitle icon={ClipboardList}>Call reviews</SectionTitle>
          <ul className="grid gap-2">
            {reviews.reviews.map((row) => (
              <li key={row.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                <span className="min-w-0 text-sm text-foreground">{row.leadName}</span>
                <span className="flex items-center gap-2">
                  <StateBadge state={row.state} of="review" />
                  {row.state === "ready" || row.state === "needsReview" ? (
                    <Button size="sm" variant="outline" onClick={() => onOpenReview(row.id)}>
                      Open
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {others.length ? (
        <Panel className="grid min-w-0 gap-3 p-4 sm:p-6">
          <SectionTitle icon={ClipboardList}>Recent briefs</SectionTitle>
          <ul className="grid gap-2">
            {others.map((row) => (
              <li key={row.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                <span className="min-w-0 text-sm text-foreground">
                  {row.leadName}
                  {row.when ? <span className="text-muted-foreground">, {row.when}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  <StateBadge state={row.state} />
                  {row.state === "ready" || row.state === "needsReview" ? (
                    <Button size="sm" variant="outline" onClick={() => onOpen(row.id)}>
                      Open
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function OpenBrief({ workspaceId, briefingId, onClose }: { workspaceId: Id<"workspaces">; briefingId: string; onClose: () => void }) {
  const brief = useQuery(api.dealBriefings.brief, { workspaceId, briefingId: briefingId as Id<"dealBriefings"> });
  if (brief === undefined) return <p className="text-sm text-muted-foreground">Opening the brief…</p>;
  return <BriefView brief={brief} onClose={onClose} />;
}

function OpenReview({ workspaceId, reviewId, onClose }: { workspaceId: Id<"workspaces">; reviewId: string; onClose: () => void }) {
  const review = useQuery(api.callReviews.review, { workspaceId, reviewId: reviewId as Id<"callReviews"> });
  if (review === undefined) return <p className="text-sm text-muted-foreground">Opening the review…</p>;
  return <ReviewView review={review} onClose={onClose} />;
}

/** Dealmaker's Calls tab, before the call, for the organization or the client the picker names. */
export function CallsTab({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const { clientId } = useClientScope();
  const data = useQuery(api.dealBriefings.calls, { workspaceId, clientId });
  const request = useMutation(api.dealBriefings.request);
  const notes = useQuery(api.callNotes.recent, { workspaceId, clientId });
  const uploadUrl = useMutation(api.callNotes.memoUploadUrl);
  const saveNote = useMutation(api.callNotes.save);
  const reviews = useQuery(api.callReviews.recent, { workspaceId, clientId });
  const requestReview = useMutation(api.callReviews.request);
  const linked = useSearchParams().get("brief");
  const [open, setOpen] = useState<string | null>(linked);
  const [openReview, setOpenReview] = useState<string | null>(null);
  if (open) return <OpenBrief workspaceId={workspaceId} briefingId={open} onClose={() => setOpen(null)} />;
  if (openReview) return <OpenReview workspaceId={workspaceId} reviewId={openReview} onClose={() => setOpenReview(null)} />;
  if (data === undefined) return <p className="text-sm text-muted-foreground">Reading your booked calls…</p>;
  const actions: CallsActions = {
    request: (input) => request({ workspaceId, clientId, ...input }),
    requestReview: ({ transcriptId, callNoteId, confirmedCredits }) =>
      requestReview({ workspaceId, clientId, confirmedCredits, ...(transcriptId ? { transcriptId: transcriptId as Id<"callTranscripts"> } : {}), ...(callNoteId ? { callNoteId: callNoteId as Id<"callNotes"> } : {}) }),
    saveNote: async ({ memo, objections, ...input }) => {
      let stored: { storageId: Id<"_storage">; seconds: number } | undefined;
      if (memo) {
        const response = await fetch(await uploadUrl({ workspaceId }), { method: "POST", headers: { "Content-Type": memo.blob.type || "audio/webm" }, body: memo.blob });
        if (!response.ok) throw new Error("The memo could not be uploaded. Try again, or save the notes without it.");
        stored = { storageId: ((await response.json()) as { storageId: Id<"_storage"> }).storageId, seconds: memo.seconds };
      }
      return saveNote({ workspaceId, clientId, ...input, objections: objections.map((row) => ({ title: row.title, ...(row.itemId ? { itemId: row.itemId as Id<"playbookItems"> } : {}) })), ...(stored ? { memo: stored } : {}) });
    },
  };
  return <CallsView data={data} actions={actions} notes={notes ?? null} reviews={reviews ?? null} onOpen={setOpen} onOpenReview={setOpenReview} />;
}
