"use client";

import { useState } from "react";

import { Plus, User, Users } from "@/components/icons";
import type { ScopeChoice } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { captionText } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type ClientType = "business" | "person";
export type ClientRow = { id: string; type: ClientType; name: string; line: string; status: "active" | "archived" };
export type BusinessProfile = { website: string; industry: string; offer: string; audience: string; geography: string; notes: string };
export type PersonProfile = { goals: string; currentState: string; notes: string };
export type ClientDetail = ClientRow & { business: BusinessProfile | null; person: PersonProfile | null };
export type AccessRow = { memberId: string; name: string; role: Role; always: boolean; assigned: boolean };
export type ClientDraft = { type: ClientType; name: string; business: BusinessProfile; person: PersonProfile };

/** Resolves with nothing when it worked, or with the words to show when it did not. */
type Act<A extends unknown[]> = (...args: A) => Promise<string | null>;

const EMPTY_BUSINESS: BusinessProfile = { website: "", industry: "", offer: "", audience: "", geography: "", notes: "" };
const EMPTY_PERSON: PersonProfile = { goals: "", currentState: "", notes: "" };

const BUSINESS_FIELDS: { key: keyof BusinessProfile; label: string; placeholder: string; long?: boolean }[] = [
  { key: "website", label: "Website", placeholder: "https://astercoaching.com" },
  { key: "industry", label: "What they do", placeholder: "Executive coaching for new directors" },
  { key: "offer", label: "What they sell", placeholder: "A twelve week leadership program, $4,800", long: true },
  { key: "audience", label: "Who they sell to", placeholder: "First-time directors at tech companies", long: true },
  { key: "geography", label: "Where they sell", placeholder: "US and Canada, online" },
  { key: "notes", label: "Notes", placeholder: "Anything your team should know before working on this client", long: true },
];

const PERSON_FIELDS: { key: keyof PersonProfile; label: string; placeholder: string }[] = [
  { key: "goals", label: "Their goals", placeholder: "Leave her job and coach full time by June" },
  { key: "currentState", label: "Where they are now", placeholder: "Three paying clients, no waitlist, posts twice a week" },
  { key: "notes", label: "Notes", placeholder: "What you agreed on the last call, what to follow up" },
];

function TypeMark({ type, className }: { type: ClientType; className?: string }) {
  const Icon = type === "person" ? User : Users;
  return (
    <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary", className)}>
      <Icon className="size-4" />
    </span>
  );
}

function ProfileFields({ draft, onChange, disabled }: { draft: ClientDraft; onChange: (next: ClientDraft) => void; disabled?: boolean }) {
  if (draft.type === "business") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {BUSINESS_FIELDS.map((field) => (
          <label key={field.key} className={cn("grid gap-1.5 text-sm", field.long && "sm:col-span-2")}>
            <span className={captionText}>{field.label}</span>
            {field.long ? (
              <Textarea rows={2} disabled={disabled} value={draft.business[field.key]} placeholder={field.placeholder} onChange={(event) => onChange({ ...draft, business: { ...draft.business, [field.key]: event.target.value } })} />
            ) : (
              <Input disabled={disabled} value={draft.business[field.key]} placeholder={field.placeholder} onChange={(event) => onChange({ ...draft, business: { ...draft.business, [field.key]: event.target.value } })} />
            )}
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {PERSON_FIELDS.map((field) => (
        <label key={field.key} className="grid gap-1.5 text-sm">
          <span className={captionText}>{field.label}</span>
          <Textarea rows={2} disabled={disabled} value={draft.person[field.key]} placeholder={field.placeholder} onChange={(event) => onChange({ ...draft, person: { ...draft.person, [field.key]: event.target.value } })} />
        </label>
      ))}
    </div>
  );
}

function TypeChoice({ value, onChange }: { value: ClientType; onChange: (next: ClientType) => void }) {
  const options: { value: ClientType; title: string; body: string }[] = [
    { value: "business", title: "A business", body: "A company you work for: its profile, brand kit, offers and ad results." },
    { value: "person", title: "A person", body: "Someone you coach or advise: their goals, where they are now, notes and calls." },
  ];
  return (
    <div role="radiogroup" aria-label="Kind of client" className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === option.value ? "border-primary bg-primary/[0.06]" : "border-border hover:bg-accent",
          )}
        >
          <TypeMark type={option.value} />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium text-foreground">{option.title}</span>
            <span className="text-xs text-muted-foreground">{option.body}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function draftOf(detail: ClientDetail): ClientDraft {
  return { type: detail.type, name: detail.name, business: detail.business ?? EMPTY_BUSINESS, person: detail.person ?? EMPTY_PERSON };
}

/**
 * Clients: who the organization serves. The list on the left, the chosen client's profile and who can
 * see it on the right. Owners and Admins change things here; a Member or Viewer reads the clients they
 * were given.
 */
export function ClientsView({
  organizationName,
  canManage,
  clients,
  archived,
  selected,
  detail,
  access,
  showing,
  onSelect,
  onShow,
  onCreate,
  onSave,
  onArchive,
  onAssign,
}: {
  organizationName: string;
  canManage: boolean;
  clients: ClientRow[];
  archived: ClientRow[];
  /** The open client's id, "new" while adding one, or null. */
  selected: string | null;
  detail: ClientDetail | null;
  /** Who can see the open client. Null for anyone who cannot manage. */
  access: AccessRow[] | null;
  /** The client the sidebar picker is on, so the page can say so. */
  showing: ScopeChoice;
  onSelect: (id: string | null) => void;
  onShow: (id: string) => void;
  onCreate: Act<[ClientDraft]>;
  onSave: Act<[string, ClientDraft]>;
  onArchive: Act<[string, boolean]>;
  onAssign: Act<[string, string, boolean]>;
}) {
  const adding = selected === "new";
  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-6">
      <PageHeader
        eyebrow={organizationName}
        title="Clients"
        description={
          canManage
            ? "The businesses and people this organization works for. Work an agent does is either for the organization itself or for one of these."
            : "The clients you have been given. An Owner or Admin adds clients and chooses who sees each one."
        }
        actions={
          canManage ? (
            <Button onClick={() => onSelect("new")}>
              <Plus aria-hidden className="size-4" /> Add a client
            </Button>
          ) : undefined
        }
      />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Clients" className={cn("grid min-w-0 gap-4", selected ? "hidden lg:grid" : "")}>
          {clients.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              {canManage ? "No clients yet. Add the first business or person you work for." : "You have not been given a client yet."}
            </p>
          ) : (
            <ul className="grid gap-1">
              {clients.map((client) => (
                <li key={client.id}>
                  <button
                    type="button"
                    aria-current={selected === client.id ? "true" : undefined}
                    onClick={() => onSelect(client.id)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected === client.id ? "border-primary bg-primary/[0.06]" : "border-transparent hover:bg-accent",
                    )}
                  >
                    <TypeMark type={client.type} />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-sm font-medium text-foreground">{client.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{client.line || (client.type === "person" ? "Person" : "Business")}</span>
                    </span>
                    {showing === client.id ? <StatusBadge label="Showing" tone="brand" icon="idle" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {archived.length > 0 ? (
            <div className="grid gap-1">
              <p className="px-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Archived</p>
              <ul className="grid gap-1">
                {archived.map((client) => (
                  <li key={client.id}>
                    <button type="button" onClick={() => onSelect(client.id)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring", selected === client.id && "bg-accent")}>
                      <span className="truncate">{client.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </nav>

        <div className="min-w-0">
          {selected ? (
            <button type="button" onClick={() => onSelect(null)} className="mb-3 text-sm text-muted-foreground underline-offset-4 hover:underline lg:hidden">
              ← All clients
            </button>
          ) : null}
          {adding ? (
            <NewClient onCreate={onCreate} onCancel={() => onSelect(null)} />
          ) : detail ? (
            <ClientCard key={detail.id} detail={detail} canManage={canManage} access={access} showing={showing === detail.id} onShow={onShow} onSave={onSave} onArchive={onArchive} onAssign={onAssign} />
          ) : (
            <p className="hidden rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground lg:block">
              {selected ? "Loading this client." : "Choose a client to see its profile and who can see it."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function NewClient({ onCreate, onCancel }: { onCreate: Act<[ClientDraft]>; onCancel: () => void }) {
  const [draft, setDraft] = useState<ClientDraft>({ type: "business", name: "", business: EMPTY_BUSINESS, person: EMPTY_PERSON });
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-4 rounded-2xl border border-border p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void onCreate(draft).then((result) => {
          setBusy(false);
          setProblem(result);
        });
      }}
    >
      <div className="grid gap-1">
        <h2 className="font-heading text-lg text-foreground">Add a client</h2>
        <p className="text-sm text-muted-foreground">Clients do not log in and are not charged for. Only you and the people you choose can see one.</p>
      </div>
      <TypeChoice value={draft.type} onChange={(type) => setDraft({ ...draft, type })} />
      <label className="grid gap-1.5 text-sm">
        <span className={captionText}>{draft.type === "person" ? "Their name" : "Business name"}</span>
        <Input required maxLength={80} value={draft.name} placeholder={draft.type === "person" ? "Dana Reyes" : "Aster Coaching"} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      </label>
      <ProfileFields draft={draft} onChange={setDraft} />
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !draft.name.trim()}>
          {busy ? "Adding…" : "Add client"}
        </Button>
      </div>
    </form>
  );
}

function ClientCard({
  detail,
  canManage,
  access,
  showing,
  onShow,
  onSave,
  onArchive,
  onAssign,
}: {
  detail: ClientDetail;
  canManage: boolean;
  access: AccessRow[] | null;
  showing: boolean;
  onShow: (id: string) => void;
  onSave: Act<[string, ClientDraft]>;
  onArchive: Act<[string, boolean]>;
  onAssign: Act<[string, string, boolean]>;
}) {
  const [draft, setDraft] = useState<ClientDraft>(() => draftOf(detail));
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const archived = detail.status === "archived";
  const changed = JSON.stringify(draft) !== JSON.stringify(draftOf(detail));
  const report = (good: string) => (result: string | null) => setNote(result ? { tone: "bad", text: result } : { tone: "good", text: good });
  return (
    <div className="grid gap-4">
      <section className="grid gap-4 rounded-2xl border border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <TypeMark type={detail.type} />
          <div className="grid min-w-0 flex-1">
            <h2 className="truncate font-heading text-lg text-foreground">{detail.name}</h2>
            <p className="text-xs text-muted-foreground">{detail.type === "person" ? "Client · person" : "Client · business"}</p>
          </div>
          {archived ? <StatusBadge label="Archived" tone="neutral" icon="stopped" /> : showing ? <StatusBadge label="Showing in the sidebar" tone="brand" icon="idle" /> : <Button variant="outline" size="sm" onClick={() => onShow(detail.id)}>Show only this client</Button>}
        </div>
        {canManage ? (
          <label className="grid gap-1.5 text-sm">
            <span className={captionText}>Name</span>
            <Input maxLength={80} disabled={archived} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
        ) : null}
        <ProfileFields draft={draft} onChange={setDraft} disabled={!canManage || archived} />
        {note ? (
          <p role={note.tone === "bad" ? "alert" : "status"} className={cn("text-sm", note.tone === "bad" ? "text-destructive" : "text-muted-foreground")}>
            {note.text}
          </p>
        ) : null}
        {canManage ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => void onArchive(detail.id, !archived).then(report(archived ? "Brought back." : "Archived. Its work is kept."))}>
              {archived ? "Bring back" : "Archive this client"}
            </Button>
            <Button disabled={!changed || archived || !draft.name.trim()} onClick={() => void onSave(detail.id, draft).then(report("Saved."))}>
              Save changes
            </Button>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {detail.type === "person"
            ? "Agents read this when they work for this person. Calls and notes you add for them stay with them."
            : "Agents read this when they work for this client, instead of your own business profile. Its brand kit, offers, calls and results files stay with it."}
        </p>
      </section>

      {access ? (
        <section className="grid gap-3 rounded-2xl border border-border p-4 sm:p-5">
          <div className="grid gap-1">
            <h3 className="font-heading text-base text-foreground">Who can see {detail.name}</h3>
            <p className="text-sm text-muted-foreground">Owners and Admins see every client. A Member or Viewer sees this one only when you switch them on. Changes take effect at once.</p>
          </div>
          <ul className="grid divide-y divide-border/70 rounded-xl border border-border">
            {access.map((row) => (
              <li key={row.memberId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <span className="grid min-w-0">
                  <span className="truncate text-sm text-foreground">{row.name}</span>
                  <span className="text-xs text-muted-foreground">{ROLE_LABEL[row.role]}</span>
                </span>
                {row.always ? (
                  <span className="text-xs text-muted-foreground">Sees every client</span>
                ) : (
                  <Switch aria-label={`${row.name} can see ${detail.name}`} checked={row.assigned} onCheckedChange={(next) => void onAssign(detail.id, row.memberId, next).then((result) => (result ? setNote({ tone: "bad", text: result }) : undefined))} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
