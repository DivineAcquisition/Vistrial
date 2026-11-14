"use client";

import { AgentAvatar } from "@/components/live/agent-avatar";
import { canWork, isAdmin } from "@/lib/roles";
import { useState, type ReactNode } from "react";

import {
  Bell,
  Brain,
  Building2,
  FileSpreadsheet,
  Gauge,
  Kanban,
  Globe,
  Lock,
  MoonIcon,
  Plug,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Users,
  Wallet,
  Zap,
} from "@/components/icons";
import { ConnectionLogo } from "@/components/connections/connection-logo";
import { PlatformLogo } from "@/components/marketing/platform-logo";
import {
  CardLink,
  ReadOnlyNote,
  ROLE_WORDS,
  SectionTitle,
  StatusCard,
  daysLeft,
  shortDate,
  shortDateTime,
  type Role,
} from "@/components/settings/settings-parts";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyField } from "@/components/ui/copy-field";
import { Input } from "@/components/ui/input";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { captionText, selectClass } from "@/lib/ui";
import type { ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useCredits } from "@/lib/credits";

/** Every action resolves when the server has the change, or rejects with the error to show. */
type Act<A extends unknown[] = []> = (...args: A) => Promise<unknown>;

const AFFECTS_ALL = "Affects everyone in this organization. Recorded in the audit log.";

/* ------------------------------------------------------------- Business */

export type BusinessData = {
  name: string;
  defaultCountry: string;
  timezone: string;
  canEdit: boolean;
  profile: { state: "confirmed" | "draft" | "none"; version: number | null };
  factCount: number | null;
};

const COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "IN", name: "India" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
];

function countryName(code: string) {
  return COUNTRIES.find((row) => row.code === code)?.name ?? code;
}

export function BusinessSection({
  role,
  data,
  memoryHref,
  profileEditor,
  onRename,
  onCountry,
}: {
  role: Role;
  data: BusinessData;
  memoryHref: string;
  /** The live business profile editor; the dev story passes a still. */
  profileEditor: ReactNode;
  onRename: Act<[string]>;
  onCountry: Act<[string]>;
}) {
  const [name, setName] = useState(data.name);
  const [editing, setEditing] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const profileWords =
    data.profile.state === "confirmed"
      ? `Business profile: confirmed (version ${data.profile.version}). Agents read this version.`
      : data.profile.state === "draft"
        ? `Business profile: a draft (version ${data.profile.version}) is waiting to be confirmed. Agents read the last confirmed version.`
        : "Business profile: not written yet. Agents work from what you tell them in each chat.";
  return (
    <div className="grid gap-4">
      <SectionTitle title="Business" description="Who the organization is for. Agents read these when they research and write." />
      <ReadOnlyNote role={role} />
      <StatusCard
        icon={Building2}
        title="Organization name"
        sentence={
          <>
            Organization name: <span className="text-foreground">{data.name}</span>. Shown to everyone in the organization and on reports.
          </>
        }
        affects={AFFECTS_ALL}
        footer={
          data.canEdit && !editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Rename
            </Button>
          ) : null
        }
      >
        {data.canEdit && editing ? (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void onRename(name).then(() => setEditing(false));
            }}
          >
            <Input aria-label="Organization name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="sm:flex-1" />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={!name.trim() || name.trim() === data.name}>
                Save name
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setName(data.name);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </StatusCard>

      <StatusCard
        icon={Globe}
        title="Country for phone numbers"
        sentence={`Phone numbers without a country code are read as ${countryName(data.defaultCountry)} (${data.defaultCountry}) numbers. Time zone: ${data.timezone}.`}
        affects={AFFECTS_ALL}
      >
        {data.canEdit ? (
          <label className="grid max-w-sm gap-1.5 text-sm">
            <span className={captionText}>Country</span>
            <select
              className={cn(selectClass, "w-full")}
              value={data.defaultCountry}
              onChange={(event) => void onCountry(event.target.value)}
            >
              {(COUNTRIES.some((row) => row.code === data.defaultCountry) ? COUNTRIES : [{ code: data.defaultCountry, name: data.defaultCountry }, ...COUNTRIES]).map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name} ({row.code})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </StatusCard>

      <StatusCard
        icon={Sparkles}
        title="Business profile"
        status={data.profile.state === "confirmed" ? "Confirmed" : data.profile.state === "draft" ? "Draft waiting" : "Not written"}
        tone={data.profile.state === "confirmed" ? "good" : data.profile.state === "draft" ? "warning" : "neutral"}
        sentence={profileWords}
        affects="Every agent reads the confirmed profile. An edit opens a new draft and keeps the old one."
        footer={
          <Button size="sm" variant="outline" onClick={() => setShowProfile((open) => !open)} aria-expanded={showProfile}>
            {showProfile ? "Hide profile" : !canWork(role) ? "View profile" : "Open profile"}
          </Button>
        }
      >
        {showProfile ? <div className="min-w-0">{profileEditor}</div> : null}
      </StatusCard>

      <StatusCard
        icon={Brain}
        title="Memory"
        sentence={
          data.factCount === null
            ? "Memory: the business facts agents have learned, each with its source and date."
            : data.factCount === 0
              ? "Memory: no business facts saved yet. Agents add them as they learn about the business."
              : `Memory: ${data.factCount} business ${data.factCount === 1 ? "fact" : "facts"} saved, each with its source and date.`
        }
        footer={<CardLink href={memoryHref}>Open memory</CardLink>}
      />
    </div>
  );
}

/* --------------------------------------------------------------- People */

type GrantRole = Exclude<Role, "owner">;

export type PeopleData = {
  canManage: boolean;
  /** Only an Owner makes or changes an Owner. */
  isOwner: boolean;
  me: string;
  organizationName: string;
  /** Other organizations of the account this person also runs, so one invite can open several. */
  grantable: { workspaceId: string; name: string }[];
  members: { id: string; name: string; email: string | null; role: Role; joinedAt: number }[];
  invites: { id: string; email: string; role: Role; organizations: { name: string; role: Role }[]; sentAt: number; expiresAt: number }[];
  supportAccess: boolean;
};

export type InviteGrant = { workspaceId: string; role: GrantRole };

const ROLE_HELP: Record<Role, string> = {
  owner: "Billing and everything, in every organization of the account.",
  admin: "Runs the organization: approves, connects accounts, manages people.",
  member: "Works with agents and tasks. Cannot approve spending or publishing.",
  viewer: "Read-only.",
};

const GRANT_ROLES: GrantRole[] = ["admin", "member", "viewer"];

export type SupportGrant = {
  id: string;
  who: string;
  staffRef: string;
  reason: string;
  startsAt: number;
  expiresAt: number;
  revokedAt: number | null;
  open: boolean;
  opens: number;
  lastOpenedAt: number | null;
};

export function supportSentence(on: boolean, grants: SupportGrant[] | null) {
  const opened = (grants ?? []).filter((row) => row.lastOpenedAt !== null).sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0];
  const last = opened ? ` Last opened ${shortDate(opened.lastOpenedAt!)} by ${opened.who.toLowerCase().startsWith("vistrial") ? opened.who : `Vistrial ${opened.who}`}, reason logged.` : grants ? " Never opened." : "";
  return on
    ? `Support access: on. Vistrial support can ask for time-limited access, with a reason, to help you.${last}`
    : `Support access: off. Vistrial staff cannot open this organization.${last}`;
}

export function PeopleSection({
  role,
  data,
  grants,
  now,
  onInvite,
  onCancelInvite,
  onRole,
  onRemove,
  onSupport,
}: {
  role: Role;
  data: PeopleData;
  /** The staff grant log. Null for anyone but an owner. */
  grants: SupportGrant[] | null;
  now: number;
  /** Resolves with the one-time link to hand over, or null when the invite was not made. */
  onInvite: (email: string, role: GrantRole, grants: InviteGrant[]) => Promise<{ link: string } | null>;
  onCancelInvite: Act<[string]>;
  onRole: Act<[string, Role]>;
  onRemove: Act<[string]>;
  onSupport: Act<[boolean]>;
}) {
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<GrantRole>("member");
  /** The other organizations ticked for this invite, with the role in each. */
  const [extra, setExtra] = useState<Record<string, GrantRole>>({});
  const [link, setLink] = useState<string | null>(null);
  const owners = data.members.filter((row) => row.role === "owner").length;
  const here = data.organizationName || "this organization";
  return (
    <div className="grid gap-4">
      <SectionTitle
        title="People"
        description={`Who is in ${here} and what each person can do here. A person can have a different role in each organization.`}
      />
      <ReadOnlyNote role={role} />
      <StatusCard
        icon={Users}
        title="Members"
        sentence={`${data.members.length} ${data.members.length === 1 ? "person" : "people"}: ${owners} ${owners === 1 ? "owner" : "owners"}. An account always keeps at least one owner.`}
        affects={data.canManage ? "Role changes and removals take effect at once and are recorded in the audit log." : undefined}
      >
        <ul className="grid divide-y divide-border/70 rounded-xl border border-border">
          {data.members.map((member) => {
            const lastOwner = member.role === "owner" && owners === 1;
            // An Admin runs the organization but never changes or removes an Owner.
            const mayChange = data.canManage && (data.isOwner || member.role !== "owner");
            return (
              <li key={member.id} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="grid min-w-0">
                  <span className="truncate text-sm text-foreground">
                    {member.name}
                    {member.id === data.me ? <span className="text-muted-foreground"> (you)</span> : null}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {member.email ?? "Email shows after their next visit"} · joined {shortDate(member.joinedAt)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {mayChange ? (
                    <select
                      aria-label={`Role for ${member.name}`}
                      className={cn(selectClass, "h-8 w-auto py-0 text-sm")}
                      value={member.role}
                      disabled={lastOwner}
                      title={lastOwner ? "The only owner keeps the owner role" : ROLE_HELP[member.role]}
                      onChange={(event) => void onRole(member.id, event.target.value as Role)}
                    >
                      {data.isOwner ? <option value="owner">Owner</option> : null}
                      {GRANT_ROLES.map((value) => (
                        <option key={value} value={value}>
                          {ROLE_WORDS[value]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <StatusBadge label={ROLE_WORDS[member.role]} tone={member.role === "owner" ? "brand" : "neutral"} icon="idle" />
                  )}
                  {mayChange && !lastOwner ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.name}`}>
                          <Trash2 aria-hidden className="size-4" />
                        </Button>
                      }
                      title={`Remove ${member.name} from ${here}?`}
                      description="They lose access to this organization straight away. Their past work stays, and any other organization they are in is not changed. You can invite them back later."
                      confirmLabel="Remove"
                      onConfirm={async () => {
                        await onRemove(member.id);
                      }}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <dl className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-[auto_minmax(0,1fr)]">
          {(["owner", "admin", "member", "viewer"] as const).map((value) => (
            <div key={value} className="contents">
              <dt className="font-medium text-foreground">{ROLE_WORDS[value]}</dt>
              <dd>{ROLE_HELP[value]}</dd>
            </div>
          ))}
        </dl>
      </StatusCard>

      <StatusCard
        icon={Zap}
        title="Invites"
        sentence={
          data.invites.length === 0
            ? "No invites waiting. An invite link works for 7 days, for the email it was sent to."
            : `${data.invites.length} ${data.invites.length === 1 ? "invite is" : "invites are"} waiting to be accepted. Each link works for 7 days, for the email it was sent to.`
        }
        affects={data.canManage ? "A new person can open each organization on their invite as soon as they accept. Recorded in the audit log." : undefined}
      >
        {data.invites.length > 0 ? (
          <ul className="grid divide-y divide-border/70 rounded-xl border border-border">
            {data.invites.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="grid min-w-0">
                  <span className="truncate text-sm text-foreground">{row.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.organizations.length > 1
                      ? row.organizations.map((entry) => `${ROLE_WORDS[entry.role]} in ${entry.name}`).join(", ")
                      : ROLE_WORDS[row.role]}{" "}
                    · sent {shortDate(row.sentAt)} · expires in {daysLeft(row.expiresAt, now)}
                  </span>
                </span>
                {data.canManage ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" size="sm">
                        Cancel invite
                      </Button>
                    }
                    title={`Cancel the invite for ${row.email}?`}
                    description="The link stops working. You can send a new invite later."
                    confirmLabel="Cancel invite"
                    cancelLabel="Keep it"
                    onConfirm={async () => {
                      await onCancelInvite(row.id);
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {data.canManage ? (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const chosen = Object.entries(extra).map(([workspaceId, grantRole]) => ({ workspaceId, role: grantRole }));
              void onInvite(email, inviteRole, chosen).then((result) => {
                if (result) {
                  setLink(result.link);
                  setEmail("");
                  setExtra({});
                }
              });
            }}
          >
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="grid gap-1.5 text-sm">
                <span className={captionText}>Email</span>
                <Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@agency.com" />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className={captionText}>Role in {here}</span>
                <select className={cn(selectClass, "w-full sm:w-36")} value={inviteRole} onChange={(event) => setInviteRole(event.target.value as GrantRole)}>
                  {GRANT_ROLES.map((value) => (
                    <option key={value} value={value}>
                      {ROLE_WORDS[value]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className={captionText}>{ROLE_HELP[inviteRole]}</p>
            {data.grantable.length > 0 ? (
              <fieldset className="grid gap-2 rounded-xl border border-border p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">Also give access to</legend>
                {data.grantable.map((organization) => {
                  const picked = extra[organization.workspaceId];
                  return (
                    <div key={organization.workspaceId} className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-primary"
                          checked={picked !== undefined}
                          onChange={(event) =>
                            setExtra((current) => {
                              const next = { ...current };
                              if (event.target.checked) next[organization.workspaceId] = inviteRole;
                              else delete next[organization.workspaceId];
                              return next;
                            })
                          }
                        />
                        <span className="truncate">{organization.name}</span>
                      </label>
                      {picked !== undefined ? (
                        <select
                          aria-label={`Role in ${organization.name}`}
                          className={cn(selectClass, "h-8 w-auto py-0 text-sm")}
                          value={picked}
                          onChange={(event) => setExtra((current) => ({ ...current, [organization.workspaceId]: event.target.value as GrantRole }))}
                        >
                          {GRANT_ROLES.map((value) => (
                            <option key={value} value={value}>
                              {ROLE_WORDS[value]}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  );
                })}
              </fieldset>
            ) : null}
            <div>
              <Button type="submit" disabled={!email.includes("@")}>
                Create invite
              </Button>
            </div>
          </form>
        ) : null}
        {link ? (
          <div className="grid gap-1">
            <CopyField label="Send this link to them. It is shown once." value={link} />
          </div>
        ) : null}
      </StatusCard>

      <StatusCard
        icon={ShieldCheck}
        title="Vistrial support access"
        status={data.supportAccess ? "On" : "Off"}
        tone={data.supportAccess ? "good" : "neutral"}
        sentence={supportSentence(data.supportAccess, grants)}
        affects={role === "owner" ? "Affects who outside your team can open this organization. Turning it off ends any open access now. Recorded in the audit log." : undefined}
      >
        {role === "owner" ? (
          <Switch
            checked={data.supportAccess}
            onCheckedChange={(next) => void onSupport(next)}
            label="Let Vistrial support open this organization when they need to"
            description="Each opening needs a written reason, lasts at most 72 hours, and is logged below."
          />
        ) : null}
        {grants ? (
          grants.length === 0 ? (
            <p className={captionText}>No staff access so far.</p>
          ) : (
            <div className="grid gap-2">
              <p className="text-xs font-medium text-muted-foreground">Access log</p>
              <ul className="grid divide-y divide-border/70 rounded-xl border border-border">
                {grants.map((grant) => (
                  <li key={grant.id} className="grid gap-1 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-foreground">
                        {grant.who} <span className="text-xs text-muted-foreground">ref …{grant.staffRef}</span>
                      </span>
                      <StatusBadge
                        label={grant.open ? "Open now" : grant.revokedAt ? "Ended early" : "Expired"}
                        tone={grant.open ? "warning" : "neutral"}
                        icon={grant.open ? "live" : "stopped"}
                        className="[&_span]:normal-case"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">&ldquo;{grant.reason}&rdquo;</p>
                    <p className="text-xs text-muted-foreground">
                      Granted {shortDateTime(grant.startsAt)} · {grant.revokedAt ? `ended ${shortDateTime(grant.revokedAt)}` : `until ${shortDateTime(grant.expiresAt)}`} ·{" "}
                      {grant.opens === 0 ? "not opened" : `opened ${grant.opens} ${grant.opens === 1 ? "time" : "times"}, last ${shortDateTime(grant.lastOpenedAt!)}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : role !== "owner" ? (
          <p className={captionText}>Only owners see the access log.</p>
        ) : null}
      </StatusCard>
    </div>
  );
}

/* --------------------------------------------------------------- Agents */

export type AgentRow = {
  slug: string;
  name: string;
  job: string;
  status: "live" | "planned";
  state: "off" | "suggesting" | "on";
  skills: { slug: string; name: string; status?: "available" | "comingSoon" }[];
};

export type AgentsData = {
  canEdit: boolean;
  agents: AgentRow[];
  defaultResearchMode: "fast" | "thorough";
  controls: {
    paused: boolean;
    halted: boolean;
    maxCostCentsPerRun: number;
    maxCostCentsPerDay: number;
    daySpentCents: number;
    ceiling: { maxCostCentsPerRun: number; maxCostCentsPerDay: number };
  } | null;
};

export function AgentsSection({
  role,
  data,
  onAgent,
  onMode,
  onPause,
  onCaps,
}: {
  role: Role;
  data: AgentsData;
  onAgent: Act<[string, boolean]>;
  onMode: Act<["fast" | "thorough"]>;
  onPause: Act<[boolean]>;
  onCaps: Act<[number, number]>;
}) {
  const credits = useCredits();
  const controls = data.controls;
  const [run, setRun] = useState(controls ? String(credits.ofCost(controls.maxCostCentsPerRun)) : "");
  const [day, setDay] = useState(controls ? String(credits.ofCost(controls.maxCostCentsPerDay)) : "");
  const live = data.agents.filter((row) => row.status === "live");
  const on = live.filter((row) => row.state !== "off");
  return (
    <div className="grid gap-4">
      <SectionTitle title="Agents" description="Which agents work for you, what each can do, and the limits they run within." />
      <ReadOnlyNote role={role} />
      <StatusCard
        icon={Sparkles}
        title="Default research quality"
        status={data.defaultResearchMode === "thorough" ? "Thorough" : "Fast"}
        tone="brand"
        sentence={
          data.defaultResearchMode === "thorough"
            ? "New chats start on Thorough: more sources, checked twice, slower and uses more credits. Anyone can switch a single chat to Fast."
            : "New chats start on Fast: fewer sources, quicker answers, fewer credits. Anyone can switch a single chat to Thorough."
        }
        affects={AFFECTS_ALL}
      >
        {data.canEdit ? (
          <SegmentedRadioGroup
            aria-label="Default research quality"
            className="max-w-sm"
            value={data.defaultResearchMode}
            onValueChange={(value) => void onMode(value as "fast" | "thorough")}
            options={[
              { value: "fast", label: "Fast" },
              { value: "thorough", label: "Thorough" },
            ]}
          />
        ) : null}
      </StatusCard>

      <StatusCard
        icon={Gauge}
        title="Pause and caps"
        status={controls?.halted ? "Platform halted" : controls?.paused ? "Paused" : "Running"}
        tone={controls?.halted ? "critical" : controls?.paused ? "warning" : "good"}
        sentence={
          controls
            ? `${controls.paused ? "Agents are paused: no new runs start." : "Agents are not paused."} Each run stops at ${credits.cost(controls.maxCostCentsPerRun)}; each day at ${credits.cost(controls.maxCostCentsPerDay)}. ${credits.cost(controls.daySpentCents)} used today.${controls.halted ? " Vistrial has halted all runs on the platform for now." : ""}`
            : "Loading the limits."
        }
        affects={data.canEdit ? "Applies to new runs for everyone. Pausing cancels runs still open. Recorded in the audit log." : undefined}
      >
        {data.canEdit && controls ? (
          <>
            <div>
              {controls.paused ? (
                <Button size="sm" onClick={() => void onPause(false)}>
                  Resume agents
                </Button>
              ) : (
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="outline">
                      Pause agents
                    </Button>
                  }
                  title="Pause every agent?"
                  description="No new runs start, and runs still open are cancelled. Resume any time."
                  confirmLabel="Pause agents"
                  onConfirm={async () => {
                    await onPause(true);
                  }}
                />
              )}
            </div>
            <form
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                // Typed in credits; a limit is kept as the cost it allows.
                void onCaps(credits.toCost(Number(run)), credits.toCost(Number(day)));
              }}
            >
              <label className="grid gap-1.5 text-sm">
                <span className={captionText}>Most credits per run, up to {credits.costCount(controls.ceiling.maxCostCentsPerRun)}</span>
                <Input inputMode="numeric" value={run} onChange={(event) => setRun(event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className={captionText}>Most credits per day, up to {credits.costCount(controls.ceiling.maxCostCentsPerDay)}</span>
                <Input inputMode="numeric" value={day} onChange={(event) => setDay(event.target.value)} />
              </label>
              <Button type="submit" variant="outline">
                Save caps
              </Button>
            </form>
          </>
        ) : null}
      </StatusCard>

      <div className="grid gap-1 pt-2">
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Catalog</h3>
        <p className="text-sm text-muted-foreground">
          {on.length} of {live.length} live {live.length === 1 ? "agent is" : "agents are"} on. Planned agents show what is coming and cannot be turned on yet.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {data.agents.map((agent) => (
          <StatusCard
            key={agent.slug}
            icon={agent.status === "live" ? Zap : Lock}
            media={<AgentAvatar slug={agent.slug} size="md" className={agent.status === "live" ? "size-9" : "size-9 opacity-70 grayscale"} />}
            title={agent.name}
            status={agent.status === "planned" ? "Planned" : agent.state === "off" ? "Off" : "On"}
            tone={agent.status === "planned" ? "neutral" : agent.state === "off" ? "neutral" : "good"}
            sentence={
              agent.status === "planned"
                ? `${agent.name}: planned. ${agent.job}`
                : `${agent.name}: ${agent.state === "off" ? "off. It does not start new work." : "on. It works when you ask."} ${agent.job}`
            }
          >
            {agent.skills.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" aria-label={`What ${agent.name} does`}>
                {agent.skills.map((skill) => (
                  <li
                    key={skill.slug}
                    className={cn(
                      "rounded-md border border-border px-2 py-0.5 text-xs",
                      skill.status === "available" ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {skill.name}
                    {skill.status === "comingSoon" ? " · planned" : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {data.canEdit && agent.status === "live" ? (
              <Switch
                checked={agent.state !== "off"}
                onCheckedChange={(next) => void onAgent(agent.slug, next)}
                label={agent.state === "off" ? `Turn ${agent.name} on` : `${agent.name} is on`}
                description="Affects everyone in this organization."
              />
            ) : null}
          </StatusCard>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Data */

export type DataData = {
  meta: { status: "none" | "connected" | "reconnect"; account: string | null; user: string | null; usedBy: string[] };
  /** HighLevel sub-accounts connected across the organization and its clients. Missing hides the card. */
  crm?: { configured: boolean; connected: number; reconnect: number; names: string[] };
  files: number;
  canManage: boolean;
};

export function DataSection({ role, data }: { role: Role; data: DataData }) {
  const meta = data.meta;
  return (
    <div className="grid gap-4">
      <SectionTitle
        title="Data"
        description="The accounts and files agents may read. Nothing is posted, published or spent, and a change in HighLevel waits for a person to approve it."
      />
      <ReadOnlyNote role={role} />
      <StatusCard
        icon={Gauge}
        title="Meta ads"
        status={meta.status === "connected" ? "Connected" : meta.status === "reconnect" ? "Reconnect needed" : "Not connected"}
        tone={meta.status === "connected" ? "good" : meta.status === "reconnect" ? "warning" : "neutral"}
        sentence={
          meta.status === "none"
            ? "Meta ads: not connected. Connect to let agents read your own Facebook and Instagram ad results."
            : `Meta ads: ${meta.status === "connected" ? "connected" : "needs reconnecting"} as ${meta.user}, reading ${meta.account ?? "no ad account yet"}. Used by ${meta.usedBy.length ? meta.usedBy.join(", ") : "no agent yet"}.`
        }
        affects="Agents use it only when you grant them. Read-only."
        footer={<CardLink href="/app/connections/meta">{meta.status === "none" ? "Connect" : "Manage"}</CardLink>}
        media={<ConnectionLogo id="meta" size={36} className="rounded-xl" />}
      />
      {data.crm ? <CrmCard crm={data.crm} /> : null}
      <StatusCard
        icon={FileSpreadsheet}
        title="Results files"
        media={<ConnectionLogo id="results" size={36} className="rounded-xl" />}
        status={data.files > 0 ? "In use" : "No files"}
        tone={data.files > 0 ? "good" : "neutral"}
        sentence={
          data.files > 0
            ? `Results files: ${data.files} ${data.files === 1 ? "file" : "files"} with totals kept, from Google Ads, your CRM, bookings or email.`
            : "Results files: none yet. Upload a CSV export; only totals are kept and cited as your data."
        }
        footer={<CardLink href="/app/connections/results">{data.files > 0 ? "Manage files" : "Upload a file"}</CardLink>}
      />
      <StatusCard
        icon={Plug}
        title="More connections"
        sentence="More connections: Google, your calendar and your call notes. Each one shows Not set up yet until Vistrial has finished setting it up."
        affects="An Owner connects and disconnects. Read-only."
        footer={<CardLink href="/app/connections/integrations">Open</CardLink>}
      >
        <div className="flex flex-wrap items-center gap-2" aria-hidden>
          {["google_calendar", "calendly", "fathom", "fireflies"].map((id) => (
            <ConnectionLogo key={id} id={id} size={28} />
          ))}
          {["google-ads", "google-analytics", "google-search-console"].map((id) => (
            <span key={id} className="inline-flex size-7 items-center justify-center rounded-lg border border-border bg-white shadow-xs">
              <PlatformLogo id={id} size={17} decorative />
            </span>
          ))}
        </div>
      </StatusCard>
      <StatusCard
        icon={ShieldCheck}
        title="Browser access"
        status="Dry run only"
        tone="neutral"
        sentence="Browser access: a practice version of an agent acting inside your own accounts. You sign in yourself, every change waits for your approval, and every step is recorded. No real account is opened yet."
        affects="Nothing. It runs against a made-up practice site."
        footer={<CardLink href="/app/connections/browser">Open</CardLink>}
      />
    </div>
  );
}

function CrmCard({ crm }: { crm: NonNullable<DataData["crm"]> }) {
  const total = crm.connected + crm.reconnect;
  const status = total === 0 ? (crm.configured ? "Not connected" : "Not set up yet") : crm.reconnect > 0 ? "Reconnect needed" : "Connected";
  const tone = total === 0 ? "neutral" : crm.reconnect > 0 ? "warning" : "good";
  const where = crm.names.slice(0, 3).join(", ") + (crm.names.length > 3 ? ` and ${crm.names.length - 3} more` : "");
  return (
    <StatusCard
      icon={Kanban}
      title="HighLevel"
      status={status}
      tone={tone}
      sentence={
        total === 0
          ? "HighLevel: not connected. Connect a sub-account for your organization or each client so Vistrial can read pipelines, won deals, lead sources and lead activity."
          : `HighLevel: ${total} ${total === 1 ? "sub-account" : "sub-accounts"} connected (${where})${crm.reconnect > 0 ? `, ${crm.reconnect} needing a reconnect` : ""}.`
      }
      affects="An Owner connects and disconnects. Vistrial reads first; it changes HighLevel only when an Owner allows it and a person approves each change. Messaging leads has its own Owner switch."
      footer={<CardLink href="/app/connections/highlevel">{total === 0 ? "Connect" : "Manage"}</CardLink>}
      media={<ConnectionLogo id="highlevel" size={36} className="rounded-xl" />}
    />
  );
}

/* -------------------------------------------------------------- Billing */

export function BillingSection() {
  return (
    <div className="grid gap-4">
      <SectionTitle title="Billing" description="Your plan, credits and invoices live on their own page." />
      <StatusCard
        icon={Wallet}
        title="Plan and credits"
        sentence="Billing: your plan, credit balance, top-ups and invoices are on the Billing page."
        affects="Owners manage billing."
        footer={<CardLink href="/app/billing">Open billing</CardLink>}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ You */

export type YouData = {
  name: string;
  email: string | null;
  role: Role;
  joinedAt: number;
  theme: ThemeChoice;
  notifications: { checkInsDue: boolean; questionsWaiting: boolean; reportReady: boolean; email: boolean };
};

const NOTICES: { key: Exclude<keyof YouData["notifications"], "email">; label: string; description: string }[] = [
  { key: "checkInsDue", label: "Check-ins due", description: "When a decision you made is ready for its follow-up." },
  { key: "questionsWaiting", label: "Questions waiting", description: "When an agent needs an answer from you to carry on." },
  { key: "reportReady", label: "Report ready", description: "When research you started has a finished report." },
];

export function YouSection({
  data,
  onTheme,
  onNotice,
  security,
  onSignOut,
}: {
  data: YouData;
  onTheme: (theme: ThemeChoice) => void;
  onNotice: Act<[keyof YouData["notifications"], boolean]>;
  /** The password, two-step sign-in and devices cards. */
  security?: ReactNode;
  onSignOut: () => void;
}) {
  const onCount = NOTICES.filter((row) => data.notifications[row.key]).length;
  return (
    <div className="grid gap-4">
      <SectionTitle title="You" description="Your own choices. They change nothing for anyone else." />
      <StatusCard
        icon={User}
        title="Your account"
        sentence={`Signed in as ${data.name}${data.email ? ` (${data.email})` : ""}. ${ROLE_WORDS[data.role]} since ${shortDate(data.joinedAt)}.`}
        footer={
          <Button size="sm" variant="outline" onClick={onSignOut}>
            Sign out
          </Button>
        }
      />
      {security}
      <StatusCard
        icon={MoonIcon}
        title="Theme"
        sentence={
          data.theme === "system"
            ? "Theme: follows this device's light or dark setting."
            : `Theme: ${data.theme}. Kept on this device and for your account.`
        }
      >
        <SegmentedRadioGroup
          aria-label="Theme"
          className="max-w-sm"
          value={data.theme}
          onValueChange={(value) => onTheme(value as ThemeChoice)}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ]}
        />
      </StatusCard>
      <StatusCard
        icon={Bell}
        title="In-app notices"
        sentence={
          onCount === NOTICES.length
            ? "Notices: all on. You see a notice in Vistrial for each of these."
            : onCount === 0
              ? "Notices: all off. You still find everything in its folder."
              : `Notices: ${onCount} of ${NOTICES.length} on.`
        }
      >
        <div className="grid gap-3">
          {NOTICES.map((row) => (
            <Switch
              key={row.key}
              checked={data.notifications[row.key]}
              onCheckedChange={(next) => void onNotice(row.key, next)}
              label={row.label}
              description={row.description}
            />
          ))}
          {!isAdmin(data.role) ? null : (
            <Switch
              checked={data.notifications.email}
              onCheckedChange={(next) => void onNotice("email", next)}
              label="Email"
              description="Also email you when a check-in is due or a report is ready. Off keeps them in Vistrial only."
            />
          )}
        </div>
      </StatusCard>
    </div>
  );
}
