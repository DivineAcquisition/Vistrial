"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { BookOpen, Check, CheckCircle2, Circle, FileText, Lightbulb, ListChecks, PenLine, Plus, Trash2, X } from "@/components/icons";
import { Checkbox } from "@/components/ui/checkbox";
import { useClientScope } from "@/components/shell/shell-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { KINDS, KIND_LABEL, LIMITS, OBJECTION_TAGS, STAGES, STAGE_FOLDER, STAGE_LABEL, type Folder, type Kind, type ObjectionTag, type Stage } from "../../../convex/lib/playbook";

import { SectionTitle, WorkHero } from "./work-shell";

/** What `api.playbook.view` returns. */
export type PlaybookData = FunctionReturnType<typeof api.playbook.view>;
type Item = PlaybookData["folders"][number]["items"][number];
type Lesson = PlaybookData["lessons"]["proposed"][number];

export type ItemDraft = { folder: Folder; kind: Kind; stage?: Stage; tag?: ObjectionTag; title: string; body: string };

export type PlaybookActions = {
  addItem: (draft: ItemDraft) => Promise<unknown>;
  updateItem: (itemId: string, draft: ItemDraft) => Promise<unknown>;
  archiveItem: (itemId: string) => Promise<unknown>;
  addLesson: (text: string) => Promise<unknown>;
  decideLesson: (lessonId: string, approve: boolean, text?: string) => Promise<unknown>;
  editLesson: (lessonId: string, text: string) => Promise<unknown>;
  removeLesson: (lessonId: string) => Promise<unknown>;
  study: (request: StudyRequest) => Promise<unknown>;
};

export type StudyRequest = { transcriptIds: string[]; texts: { label: string; text: string }[]; offerAnalysis: boolean; website: string[]; videos: string[] };

const TAG_LABEL: Record<ObjectionTag, string> = { money: "Money", time: "Time", trust: "Trust", fit: "Fit" };

/** Basis badges carry words, never colour alone. */
function BasisBadge({ basis, label }: { basis: string; label: string }) {
  const variant = basis === "firstParty" ? "success" : basis === "observed" ? "info" : basis === "hypothesis" ? "warning" : "outline";
  return (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
  );
}

async function run(action: () => Promise<unknown>) {
  try {
    await action();
    return true;
  } catch (error) {
    showError(error);
    return false;
  }
}

function ItemForm({ folder, initial, onSave, onCancel }: { folder: Folder; initial?: ItemDraft; onSave: (draft: ItemDraft) => Promise<boolean>; onCancel: () => void }) {
  const kinds = KINDS[folder] as readonly Kind[];
  const [kind, setKind] = useState<Kind>(initial?.kind ?? kinds[0]);
  const stages = STAGES.filter((row) => STAGE_FOLDER[row] === folder);
  const [stage, setStage] = useState<Stage>(initial?.stage ?? stages[0] ?? "open");
  const [tag, setTag] = useState<ObjectionTag>(initial?.tag ?? "money");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const ok = await onSave({ folder, kind, stage: kind === "scriptStep" ? stage : undefined, tag: kind === "objection" ? tag : undefined, title, body });
    setSaving(false);
    if (ok && !initial) {
      setTitle("");
      setBody("");
    }
  };
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:p-4" data-playbook-form>
      <div className="grid gap-3 sm:grid-cols-2">
        {kinds.length > 1 ? (
          <Select aria-label="Kind" value={kind} onChange={(event) => setKind(event.target.value as Kind)} options={kinds.map((row) => ({ value: row, label: KIND_LABEL[row] }))} />
        ) : null}
        {kind === "scriptStep" ? (
          <Select aria-label="Call stage" value={stage} onChange={(event) => setStage(event.target.value as Stage)} options={stages.map((row) => ({ value: row, label: STAGE_LABEL[row] }))} />
        ) : null}
        {kind === "objection" ? (
          <Select aria-label="Tag" value={tag} onChange={(event) => setTag(event.target.value as ObjectionTag)} options={OBJECTION_TAGS.map((row) => ({ value: row, label: TAG_LABEL[row] }))} />
        ) : null}
      </div>
      <Input aria-label="Title" placeholder="A short title" value={title} maxLength={LIMITS.title} onChange={(event) => setTitle(event.target.value)} />
      <Textarea aria-label="Details" placeholder="The details, in your own words" value={body} maxLength={LIMITS.body} rows={4} onChange={(event) => setBody(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={save} disabled={saving || !title.trim()}>
          <Check aria-hidden className="size-4" />
          {initial ? "Save" : "Add"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ItemRow({ item, editor, actions }: { item: Item; editor: boolean; actions: PlaybookActions }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li>
        <ItemForm
          folder={item.folder}
          initial={{ folder: item.folder, kind: item.kind, stage: item.stage ?? undefined, tag: item.tag ?? undefined, title: item.title, body: item.body }}
          onSave={async (draft) => {
            const ok = await run(() => actions.updateItem(item.id, draft));
            if (ok) setEditing(false);
            return ok;
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }
  return (
    <li className="grid gap-2 rounded-lg border border-border p-3 sm:p-4" data-playbook-item={item.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{item.kindLabel}</span>
            {item.stageLabel ? <Badge variant="outline" size="sm">{item.stageLabel}</Badge> : null}
            {item.tag ? <Badge variant="outline" size="sm">{TAG_LABEL[item.tag]}</Badge> : null}
          </p>
          <p className="font-medium break-words text-foreground">{item.title}</p>
        </div>
        {editor ? (
          <div className="flex shrink-0 gap-1">
            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${item.title}`} onClick={() => setEditing(true)}>
              <PenLine aria-hidden className="size-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Archive ${item.title}`} onClick={() => void run(() => actions.archiveItem(item.id))}>
              <Trash2 aria-hidden className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
      {item.body ? <p className="text-sm leading-relaxed whitespace-pre-line break-words text-muted-foreground">{item.body}</p> : null}
      {item.quote ? (
        <blockquote className="border-l-2 border-border pl-3 text-sm leading-relaxed break-words text-foreground">
          <span className="sr-only">In the source&apos;s words: </span>“{item.quote}”
        </blockquote>
      ) : null}
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <BasisBadge basis={item.basis} label={item.basisLabel} />
        <span>
          {item.source.words}
          {item.source.label ? `: ${item.source.label}` : ""}
        </span>
      </p>
    </li>
  );
}

function FolderPanel({ folder, editor, actions }: { folder: PlaybookData["folders"][number]; editor: boolean; actions: PlaybookActions }) {
  const [adding, setAdding] = useState(false);
  const stages = STAGES.filter((row) => STAGE_FOLDER[row] === folder.id);
  const scriptFirst = stages.length > 0;
  const script = folder.items.filter((row) => row.kind === "scriptStep");
  const rest = scriptFirst ? folder.items.filter((row) => row.kind !== "scriptStep") : folder.items;
  return (
    <Panel className="grid min-w-0 gap-4 p-4 sm:p-6" data-playbook-folder={folder.id}>
      <SectionTitle
        icon={BookOpen}
        aside={
          editor && !adding ? (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus aria-hidden className="size-4" />
              Add to {folder.name}
            </Button>
          ) : null
        }
      >
        {folder.name}
      </SectionTitle>
      <p className="text-sm text-muted-foreground">{folder.holds}</p>
      {adding ? (
        <ItemForm
          folder={folder.id}
          onSave={async (draft) => {
            const ok = await run(() => actions.addItem(draft));
            if (ok) setAdding(false);
            return ok;
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}
      {scriptFirst
        ? stages.map((stage) => {
            const steps = script.filter((row) => row.stage === stage);
            return (
              <section key={stage} className="grid gap-2" aria-label={`${STAGE_LABEL[stage]} stage`}>
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">The {STAGE_LABEL[stage]} stage of a call</h3>
                {steps.length ? (
                  <ul className="grid gap-2">
                    {steps.map((item) => (
                      <ItemRow key={item.id} item={item} editor={editor} actions={actions} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No script steps for this stage yet.</p>
                )}
              </section>
            );
          })
        : null}
      {rest.length ? (
        <ul className="grid gap-2">
          {rest.map((item) => (
            <ItemRow key={item.id} item={item} editor={editor} actions={actions} />
          ))}
        </ul>
      ) : scriptFirst ? null : (
        <p className="text-sm text-muted-foreground">Nothing in {folder.name} yet.</p>
      )}
    </Panel>
  );
}

function NeedsPanel({ needs }: { needs: PlaybookData["needs"] }) {
  return (
    <Panel className="grid min-w-0 gap-4 p-4 sm:p-6" data-playbook-needs>
      <SectionTitle icon={ListChecks}>What Dealmaker still needs</SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {needs.map((row) => (
          <li key={row.skill} className="grid gap-1.5 rounded-lg border border-border p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              {row.ready ? <CheckCircle2 aria-hidden className="size-4 text-success" /> : <Circle aria-hidden className="size-4 text-muted-foreground" />}
              {row.name}
              <span className="sr-only">{row.ready ? ": has what it needs" : ": still needs more"}</span>
            </p>
            <ul className="grid gap-1">
              {row.needs.map((need) => (
                <li key={need.id} className={cn("text-xs leading-relaxed", need.met ? "text-muted-foreground" : "text-foreground")}>
                  {need.line}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function LessonRow({ lesson, editor, actions }: { lesson: Lesson; editor: boolean; actions: PlaybookActions }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(lesson.text);
  const proposed = lesson.status === "proposed";
  if (editing) {
    return (
      <li className="grid gap-2 rounded-lg border border-border p-3">
        <Textarea aria-label="Lesson" value={text} maxLength={LIMITS.lesson} rows={2} onChange={(event) => setText(event.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={async () => {
              const ok = await run(() => (proposed ? actions.decideLesson(lesson.id, true, text) : actions.editLesson(lesson.id, text)));
              if (ok) setEditing(false);
            }}
          >
            <Check aria-hidden className="size-4" />
            {proposed ? "Approve as edited" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }
  return (
    <li className="grid gap-2 rounded-lg border border-border p-3" data-playbook-lesson={lesson.id}>
      <p className="text-sm leading-relaxed text-foreground">{lesson.text}</p>
      <p className="text-xs text-muted-foreground">{lesson.byDealmaker ? (proposed ? "Proposed by Dealmaker from an edit to a draft" : "Proposed by Dealmaker, approved by your team") : "Written by your team"}</p>
      {editor ? (
        <div className="flex flex-wrap gap-2">
          {proposed ? (
            <>
              <Button size="sm" onClick={() => void run(() => actions.decideLesson(lesson.id, true))}>
                <Check aria-hidden className="size-4" />
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <PenLine aria-hidden className="size-4" />
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void run(() => actions.decideLesson(lesson.id, false))}>
                <X aria-hidden className="size-4" />
                Reject
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <PenLine aria-hidden className="size-4" />
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void run(() => actions.removeLesson(lesson.id))}>
                <Trash2 aria-hidden className="size-4" />
                Remove
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

function LessonsPanel({ lessons, editor, actions }: { lessons: PlaybookData["lessons"]; editor: boolean; actions: PlaybookActions }) {
  const [text, setText] = useState("");
  return (
    <Panel className="grid min-w-0 gap-4 p-4 sm:p-6" data-playbook-lessons>
      <SectionTitle icon={Lightbulb}>What I&apos;ve learned about how you sell</SectionTitle>
      <p className="text-sm text-muted-foreground">Dealmaker proposes a lesson when someone edits or rejects a draft. It guides drafts only once a person approves it.</p>
      {lessons.proposed.length ? (
        <section className="grid gap-2" aria-label="Waiting for a person">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Waiting for a person ({lessons.proposed.length})</h3>
          <ul className="grid gap-2">
            {lessons.proposed.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} editor={editor} actions={actions} />
            ))}
          </ul>
        </section>
      ) : null}
      <section className="grid gap-2" aria-label="Guiding drafts">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Guiding drafts ({lessons.approved.length})</h3>
        {lessons.approved.length ? (
          <ul className="grid gap-2">
            {lessons.approved.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} editor={editor} actions={actions} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No lessons yet.</p>
        )}
      </section>
      {editor ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run(() => actions.addLesson(text))) setText("");
          }}
        >
          <Input aria-label="A lesson of your own" placeholder="Add a lesson of your own" value={text} maxLength={LIMITS.lesson} onChange={(event) => setText(event.target.value)} />
          <Button type="submit" variant="outline" disabled={!text.trim()}>
            <Plus aria-hidden className="size-4" />
            Add lesson
          </Button>
        </form>
      ) : null}
    </Panel>
  );
}

/** Text files are read in the browser; anything else is pasted. */
const TEXT_FILE = /\.(txt|md|markdown|csv)$/i;
const MAX_FILE_CHARS = 60_000;

function studyLine(row: PlaybookData["studies"][number]) {
  const from = row.sources.join(", ");
  if (row.status === "running") return `Reading ${from}…`;
  if (row.status === "failed") return `Could not finish reading ${from}.`;
  const left = row.dropped ? ` ${row.dropped} left out: Dealmaker could not show the words it rested on, or the Playbook already had it.` : "";
  return `Filed ${row.filed ?? 0} ${row.filed === 1 ? "item" : "items"} from ${from}.${left}`;
}

function StudyPanel({ data, actions }: { data: PlaybookData; actions: PlaybookActions }) {
  const [calls, setCalls] = useState<string[]>([]);
  const [offer, setOffer] = useState(false);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [pages, setPages] = useState("");
  const [links, setLinks] = useState("");
  const [sending, setSending] = useState(false);
  const pasted = label.trim() && text.trim();
  const website = pages.split(/\s+/).map((row) => row.trim()).filter(Boolean);
  const videos = links.split(/\s+/).map((row) => row.trim()).filter(Boolean);
  const ready = calls.length > 0 || offer || pasted || website.length > 0 || videos.length > 0;
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (!TEXT_FILE.test(file.name)) {
      showError(new Error("Choose a text file (.txt or .md), or paste the words."));
      return;
    }
    setLabel(file.name.slice(0, 120));
    setText((await file.text()).slice(0, MAX_FILE_CHARS));
  };
  return (
    <Panel className="grid min-w-0 gap-4 p-4 sm:p-6" data-playbook-study>
      <SectionTitle icon={FileText}>Read into the Playbook</SectionTitle>
      <p className="text-sm text-muted-foreground">Dealmaker reads what you choose and files what it finds into the folders. Each item quotes the words it rests on and is marked an inference until someone on your team edits it.</p>
      {data.readable.transcripts.length ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Calls shared with Dealmaker</legend>
          {data.readable.transcripts.map((row) => (
            <label key={row.id} className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={calls.includes(row.id)} onCheckedChange={(checked) => setCalls((now) => (checked ? [...now, row.id] : now.filter((id) => id !== row.id)))} />
              <span className="min-w-0 break-words">
                {row.title}
                {row.callDate ? <span className="text-muted-foreground"> · {row.callDate}</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">No calls are shared with Dealmaker yet. Share one from Connections, under call transcripts.</p>
      )}
      {data.readable.offerAnalysis ? (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox checked={offer} onCheckedChange={(checked) => setOffer(checked === true)} />
          <span className="min-w-0 break-words">Strategist&apos;s approved offer analysis: {data.readable.offerAnalysis.title}</span>
        </label>
      ) : null}
      <div className="grid gap-1.5">
        <Textarea aria-label="Pages of your website" placeholder="Pages of your own website, one per line (up to 4), e.g. yoursite.com/offer" value={pages} rows={2} onChange={(event) => setPages(event.target.value)} />
        <p className="text-xs text-muted-foreground">Read as a visitor would: public pages only, never behind a login, and only where the site allows it.</p>
      </div>
      <div className="grid gap-1.5">
        <Textarea aria-label="YouTube links" placeholder="Public YouTube links to sales training, one per line (up to 3)" value={links} rows={2} onChange={(event) => setLinks(event.target.value)} />
        <p className="text-xs text-muted-foreground">Read by Google&apos;s Gemini from the link. The video is never downloaded; only what it says and shows is kept, with each item quoting it.</p>
      </div>
      <div className="grid gap-2">
        <Input aria-label="What the text is" placeholder="What it is, e.g. Sales script" value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} />
        <Textarea aria-label="Text to read" placeholder="Paste a sales script, an offer document or a past proposal" value={text} rows={5} maxLength={MAX_FILE_CHARS} onChange={(event) => setText(event.target.value)} />
        <label className="w-fit text-xs text-muted-foreground">
          <span className="underline underline-offset-2">Or choose a text file</span>
          <input type="file" accept=".txt,.md,.markdown,.csv,text/plain,text/markdown" className="sr-only" onChange={(event) => void readFile(event.target.files?.[0])} />
        </label>
      </div>
      <div>
        <Button
          disabled={!ready || sending}
          onClick={async () => {
            setSending(true);
            const ok = await run(() => actions.study({ transcriptIds: calls, texts: pasted ? [{ label, text }] : [], offerAnalysis: offer, website, videos }));
            setSending(false);
            if (ok) {
              setCalls([]);
              setOffer(false);
              setLabel("");
              setText("");
              setPages("");
              setLinks("");
            }
          }}
        >
          <BookOpen aria-hidden className="size-4" />
          Read these
        </Button>
      </div>
      {data.studies.length ? (
        <ul className="grid gap-1.5 border-t border-border pt-3" aria-label="Recent reading">
          {data.studies.map((row) => (
            <li key={row.id} className="grid gap-0.5 text-sm">
              <span className="text-foreground">{studyLine(row)}</span>
              {row.missing.map((line) => (
                <span key={line} className="text-xs text-muted-foreground">
                  {line}
                </span>
              ))}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

/** The Playbook with its data handed in, so a story can show it without a server. */
export function PlaybookView({ data, editor, actions, initialFolder = "offer" }: { data: PlaybookData; editor: boolean; actions: PlaybookActions; initialFolder?: Folder }) {
  const [open, setOpen] = useState<Folder>(initialFolder);
  const folder = data.folders.find((row) => row.id === open) ?? data.folders[0];
  const canEdit = editor && data.canEdit;
  return (
    <div className="grid min-w-0 gap-5">
      <WorkHero
        icon={BookOpen}
        agent="sales-conversion"
        eyebrow="Dealmaker · Playbook"
        title="How you sell, in one place"
        promise="What Dealmaker knows about your offer, your buyers, the objections you hear and how you close. Every item says where it came from."
      />
      <NeedsPanel needs={data.needs} />
      {canEdit ? <StudyPanel data={data} actions={actions} /> : null}
      <SegmentedRadioGroup
        aria-label="Playbook folder"
        value={open}
        onValueChange={(value) => setOpen(value as Folder)}
        options={data.folders.map((row) => ({ value: row.id, label: `${row.name} (${row.items.length})` }))}
        wrap
      />
      <FolderPanel key={folder.id} folder={folder} editor={canEdit} actions={actions} />
      <LessonsPanel lessons={data.lessons} editor={canEdit} actions={actions} />
    </div>
  );
}

/** Dealmaker's Playbook for the organization or the client the picker names. */
export function PlaybookTab({ workspaceId, editor }: { workspaceId: Id<"workspaces">; editor: boolean }) {
  const { clientId } = useClientScope();
  const data = useQuery(api.playbook.view, { workspaceId, clientId });
  const addItem = useMutation(api.playbook.addItem);
  const updateItem = useMutation(api.playbook.updateItem);
  const archiveItem = useMutation(api.playbook.archiveItem);
  const addLesson = useMutation(api.playbook.addLesson);
  const decideLesson = useMutation(api.playbook.decideLesson);
  const editLesson = useMutation(api.playbook.editLesson);
  const removeLesson = useMutation(api.playbook.removeLesson);
  const study = useMutation(api.playbook.study);
  if (data === undefined) return <p className="text-sm text-muted-foreground">Opening the Playbook…</p>;
  const actions: PlaybookActions = {
    addItem: (draft) => addItem({ workspaceId, clientId, ...draft }),
    updateItem: (itemId, draft) => updateItem({ workspaceId, itemId: itemId as Id<"playbookItems">, ...draft }),
    archiveItem: (itemId) => archiveItem({ workspaceId, itemId: itemId as Id<"playbookItems"> }),
    addLesson: (text) => addLesson({ workspaceId, clientId, text }),
    decideLesson: (lessonId, approve, text) => decideLesson({ workspaceId, lessonId: lessonId as Id<"playbookLessons">, approve, text }),
    editLesson: (lessonId, text) => editLesson({ workspaceId, lessonId: lessonId as Id<"playbookLessons">, text }),
    removeLesson: (lessonId) => removeLesson({ workspaceId, lessonId: lessonId as Id<"playbookLessons"> }),
    study: (request) =>
      study({
        workspaceId,
        clientId,
        transcriptIds: request.transcriptIds as Id<"callTranscripts">[],
        texts: request.texts,
        offerAnalysis: request.offerAnalysis,
        website: request.website,
        videos: request.videos,
      }),
  };
  return <PlaybookView data={data} editor={editor} actions={actions} />;
}
