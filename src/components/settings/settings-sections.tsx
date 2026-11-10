"use client";

import { useState, type ReactNode } from "react";

import {
  Bell,
  Brain,
  Building2,
  ExternalLink,
  FileSpreadsheet,
  Gauge,
  Globe,
  Lock,
  MoonIcon,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Users,
  Wallet,
  Zap,
} from "@/components/icons";
import { MetaLogo } from "@/components/connections/meta-logo";
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

/** Every action resolves when the server has the change, or rejects with the error to show. */
type Act<A extends unknown[] = []> = (...args: A) => Promise<unknown>;

const AFFECTS_ALL = "Affects everyone in this workspace. Recorded in the audit log.";

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
      <SectionTitle title="Business" description="Who the workspace is for. Agents read these when they research and write." />
      <ReadOnlyNote role={role} />
      <StatusCard
        icon={Building2}
        title="Workspace name"
        sentence={
          <>
            Workspace name: <span className="text-foreground">{data.name}</span>. Shown to everyone in the workspace and on reports.
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
            <Input aria-label="Workspace name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="sm:flex-1" />
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
            {showProfile ? "Hide profile" : role === "rep" ? "View profile" : "Open profile"}
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

export type PeopleData = {
  canManage: boolean;
  me: string;
  members: { id: string; name: string; email: string | null; role: Role; joinedAt: number }[];
  invites: { id: string; email: string; role: "manager" | "rep"; sentAt: number; expiresAt: number }[];
  supportAccess: boolean;
};

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
    : `Support access: off. Vistrial staff cannot open this workspace.${last}`;
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
  onInvite: (email: string, role: "manager" | "rep") => Promise<{ link: string } | null>;
  onCancelInvite: Act<[string]>;
  onRole: Act<[string, Role]>;
  onRemove: Act<[string]>;
  onSupport: Act<[boolean]>;
}) {
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "rep">("rep");
  const [link, setLink] = useState<string | null>(null);
  const owners = data.members.filter((row) => row.role === "owner").length;
  return (
    <div className="grid gap-4">
      <SectionTitle title="People" description="Who is in the workspace and what each person can do. Owners change everything; managers see most things; reps see their own work." />
      <ReadOnlyNote role={role} />
      <StatusCard
        icon={Users}
        title="Members"
        sentence={`${data.members.length} ${data.members.length === 1 ? "member" : "members"}: ${owners} ${owners === 1 ? "owner" : "owners"}. A workspace always keeps at least one owner.`}
        affects={data.canManage ? "Role changes and removals take effect at once and are recorded in the audit log." : undefined}
      >
        <ul className="grid divide-y divide-border/70 rounded-xl border border-border">
          {data.members.map((member) => {
            const lastOwner = member.role === "owner" && owners === 1;
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
                  {data.canManage ? (
                    <select
                      aria-label={`Role for ${member.name}`}
                      className={cn(selectClass, "h-8 w-auto py-0 text-sm")}
                      value={member.role}
                      disabled={lastOwner}
                      title={lastOwner ? "The only owner keeps the owner role" : undefined}
                      onChange={(event) => void onRole(member.id, event.target.value as Role)}
                    >
                      <option value="owner">Owner</option>
                      <option value="manager">Manager</option>
                      <option value="rep">Rep</option>
                    </select>
                  ) : (
                    <StatusBadge label={ROLE_WORDS[member.role]} tone={member.role === "owner" ? "brand" : "neutral"} icon="idle" />
                  )}
                  {data.canManage && !lastOwner ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.name}`}>
                          <Trash2 aria-hidden className="size-4" />
                        </Button>
                      }
                      title={`Remove ${member.name}?`}
                      description="They lose access to this workspace straight away. Their past work stays. You can invite them back later."
                      confirmLabel="Remove member"
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
      </StatusCard>

      <StatusCard
        icon={Zap}
        title="Invites"
        sentence={
          data.invites.length === 0
            ? "No invites waiting. An invite link works for 7 days, for the email it was sent to."
            : `${data.invites.length} ${data.invites.length === 1 ? "invite is" : "invites are"} waiting to be accepted. Each link works for 7 days, for the email it was sent to.`
        }
        affects={data.canManage ? "A new member can see the workspace as soon as they accept. Recorded in the audit log." : undefined}
      >
        {data.invites.length > 0 ? (
          <ul className="grid divide-y divide-border/70 rounded-xl border border-border">
            {data.invites.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="grid min-w-0">
                  <span className="truncate text-sm text-foreground">{row.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {ROLE_WORDS[row.role]} · sent {shortDate(row.sentAt)} · expires in {daysLeft(row.expiresAt, now)}
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
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void onInvite(email, inviteRole).then((result) => {
                if (result) {
                  setLink(result.link);
                  setEmail("");
                }
              });
            }}
          >
            <label className="grid gap-1.5 text-sm">
              <span className={captionText}>Email</span>
              <Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@business.com" />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className={captionText}>Role</span>
              <select className={cn(selectClass, "w-full sm:w-36")} value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "manager" | "rep")}>
                <option value="manager">Manager</option>
                <option value="rep">Rep</option>
              </select>
            </label>
            <Button type="submit" disabled={!email.includes("@")}>
              Create invite
            </Button>
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
        affects={role === "owner" ? "Affects who outside your team can open this workspace. Turning it off ends any open access now. Recorded in the audit log." : undefined}
      >
        {role === "owner" ? (
          <Switch
            checked={data.supportAccess}
            onCheckedChange={(next) => void onSupport(next)}
            label="Let Vistrial support open this workspace when they need to"
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

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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
  const controls = data.controls;
  const [run, setRun] = useState(controls ? (controls.maxCostCentsPerRun / 100).toFixed(2) : "");
  const [day, setDay] = useState(controls ? (controls.maxCostCentsPerDay / 100).toFixed(2) : "");
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
            ? `${controls.paused ? "Agents are paused: no new runs start." : "Agents are not paused."} Each run stops at ${dollars(controls.maxCostCentsPerRun)}; each day at ${dollars(controls.maxCostCentsPerDay)}. ${dollars(controls.daySpentCents)} used today.${controls.halted ? " Vistrial has halted all runs on the platform for now." : ""}`
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
                void onCaps(Math.round(Number(run) * 100), Math.round(Number(day) * 100));
              }}
            >
              <label className="grid gap-1.5 text-sm">
                <span className={captionText}>Most per run, up to {dollars(controls.ceiling.maxCostCentsPerRun)}</span>
                <Input inputMode="decimal" value={run} onChange={(event) => setRun(event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className={captionText}>Most per day, up to {dollars(controls.ceiling.maxCostCentsPerDay)}</span>
                <Input inputMode="decimal" value={day} onChange={(event) => setDay(event.target.value)} />
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
              <ul className="flex flex-wrap gap-1.5" aria-label={`${agent.name} skills`}>
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
                description="Affects everyone in this workspace."
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
  files: number;
  canManage: boolean;
};

export function DataSection({ role, data }: { role: Role; data: DataData }) {
  const meta = data.meta;
  return (
    <div className="grid gap-4">
      <SectionTitle
        title="Data"
        description="The accounts and files agents may read. Everything is read-only: nothing is posted, published or spent."
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
      >
        <MetaLogo className="h-4 w-fit opacity-80" />
      </StatusCard>
      <StatusCard
        icon={FileSpreadsheet}
        title="Results files"
        status={data.files > 0 ? "In use" : "No files"}
        tone={data.files > 0 ? "good" : "neutral"}
        sentence={
          data.files > 0
            ? `Results files: ${data.files} ${data.files === 1 ? "file" : "files"} with totals kept, from Google Ads, your CRM, bookings or email.`
            : "Results files: none yet. Upload a CSV export; only totals are kept and cited as your data."
        }
        footer={<CardLink href="/app/connections/results">{data.files > 0 ? "Manage files" : "Upload a file"}</CardLink>}
      />
    </div>
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
  onAccount,
}: {
  data: YouData;
  onTheme: (theme: ThemeChoice) => void;
  onNotice: Act<[keyof YouData["notifications"], boolean]>;
  onAccount: () => void;
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
          <Button size="sm" variant="outline" onClick={onAccount}>
            Password, sessions and two-step sign-in <ExternalLink aria-hidden className="size-3.5" />
          </Button>
        }
        affects="Sign-in is handled by Clerk."
      />
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
          {data.role === "rep" ? null : (
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
