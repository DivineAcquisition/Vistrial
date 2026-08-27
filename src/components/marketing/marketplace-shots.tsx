import {
  Activity,
  BarChart3,
  ClipboardList,
  FolderOpen,
  ListChecks,
  Phone,
  Settings2,
  type LucideIcon,
} from "lucide-react";

import Logo from "@/components/brand/logo";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import { Button } from "@/components/ui/button";
import { MagicCard } from "@/components/ui/magic-card";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DEMO_CASE } from "@/lib/marketing/demo-case";
import { NAV_GROUPS, PRIMARY_NAV, type NavIcon } from "@/lib/navigation";
import { captionText, pageTitle, sectionLabel } from "@/lib/ui";
import { cn } from "@/lib/utils";

export const MARKETPLACE_SHOTS = ["queue", "case", "brief", "follow-up"] as const;
export type MarketplaceShot = (typeof MARKETPLACE_SHOTS)[number];

const ICONS: Record<NavIcon, LucideIcon> = {
  queue: ListChecks,
  log: ClipboardList,
  cases: FolderOpen,
  calls: Phone,
  reporting: BarChart3,
  settings: Settings2,
  activity: Activity,
};

const ACTIVE: Record<MarketplaceShot, string> = {
  queue: "/app/queue",
  case: "/app/cases",
  brief: "/app/cases",
  "follow-up": "/app/queue",
};

const QUEUE_ROWS = [
  {
    name: "Avery Cole",
    score: 81,
    track: "Ready",
    source: "Meta · Webinar",
    optedIn: "6h",
    last: "6h · none",
    setter: "Maya Chen",
    closer: "Chris Adel",
    alarm: true,
    breach: "2h 12m",
  },
  {
    name: DEMO_CASE.name,
    score: DEMO_CASE.score.total,
    track: DEMO_CASE.track,
    source: "Meta · Webinar",
    optedIn: "3d",
    last: "14h · SMS",
    setter: DEMO_CASE.setter,
    closer: DEMO_CASE.closer,
    alarm: false,
    breach: null,
  },
  {
    name: "Sam Ortiz",
    score: 61,
    track: "Nurture",
    source: "GHL form",
    optedIn: "5d",
    last: "1d · Call",
    setter: "Maya Chen",
    closer: "—",
    alarm: false,
    breach: null,
  },
  {
    name: "Riley Nguyen",
    score: null,
    track: null,
    source: "Referral",
    optedIn: "2d",
    last: "2d · Form",
    setter: "—",
    closer: "—",
    alarm: false,
    breach: null,
  },
] as const;

function SampleMark() {
  return (
    <p className={cn(captionText, "uppercase tracking-[0.14em]")}>{DEMO_CASE.sampleLabel}</p>
  );
}

function PreviewShell({
  shot,
  title,
  description,
  children,
}: {
  shot: MarketplaceShot;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const active = ACTIVE[shot];
  return (
    <div
      data-marketplace-shot={shot}
      className="flex h-[720px] w-[1280px] overflow-hidden bg-ink-950 text-card-foreground"
    >
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.07] bg-ink-900">
        <div className="flex items-center px-4 py-5">
          <Logo markOnly className="h-9 w-auto" />
        </div>
        <div className="px-3 pb-4">
          <p className="truncate rounded-xl border border-white/[0.08] bg-ink-850 px-3 py-2 text-xs text-silver">
            Northline Coaching
          </p>
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-hidden px-2">
          {NAV_GROUPS.map((group) => {
            const items = PRIMARY_NAV.filter(
              (item) => item.group === group.id && !item.platformAdminOnly,
            );
            if (items.length === 0) return null;
            return (
              <div key={group.id}>
                <p className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.16em] text-silver/70 uppercase">
                  {group.label}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {items.map((item) => {
                    const Icon = ICONS[item.icon];
                    const isActive = active === item.href;
                    return (
                      <li key={item.href}>
                        <span
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm",
                            isActive
                              ? "bg-brand-500/15 text-white"
                              : "text-silver",
                          )}
                        >
                          <Icon className="size-4 shrink-0" aria-hidden />
                          {item.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-hidden px-6 py-5">
        <header className="mb-5">
          <SampleMark />
          <h1 className={cn(pageTitle, "mt-2")}>{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          <div
            aria-hidden
            className="mt-4 h-px bg-linear-to-r from-transparent via-brand-500/30 to-transparent"
          />
        </header>
        {children}
      </main>
    </div>
  );
}

function QueueShot() {
  return (
    <PreviewShell
      shot="queue"
      title="Queue"
      description="Leads waiting on a human, scored and assigned. Alarms cannot be dismissed until someone works them."
    >
      <Panel className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/[0.07] hover:bg-transparent">
              {["Lead", "Breach", "Score", "Source", "Last touch", "Setter", "Closer"].map(
                (label) => (
                  <TableHead
                    key={label}
                    className="px-4 py-2.5 text-[11px] font-semibold tracking-[0.12em] text-dim uppercase"
                  >
                    {label}
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {QUEUE_ROWS.map((row) => (
              <TableRow
                key={row.name}
                className={cn(
                  "border-white/[0.06]",
                  row.alarm ? "bg-brand-500/[0.08]" : "hover:bg-transparent",
                )}
              >
                <TableCell className="px-4 py-3 font-medium text-white">{row.name}</TableCell>
                <TableCell
                  className={cn(
                    "px-4 py-3 tabular-nums",
                    row.alarm ? "text-flag-critical" : "text-dim",
                  )}
                >
                  {row.breach ?? "—"}
                </TableCell>
                <TableCell className="px-4 py-3">
                  {row.score === null ? (
                    <StatusBadge label="Unscored" tone="warning" />
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-white">{row.score}</span>
                      {row.track ? <StatusBadge label={row.track} tone="good" /> : null}
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-4 py-3 text-silver">{row.source}</TableCell>
                <TableCell className="px-4 py-3 text-silver">{row.last}</TableCell>
                <TableCell className="px-4 py-3 text-silver">{row.setter}</TableCell>
                <TableCell className="px-4 py-3 text-silver">{row.closer}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </PreviewShell>
  );
}

function CaseShot() {
  const demo = DEMO_CASE;
  return (
    <PreviewShell
      shot="case"
      title={demo.name}
      description="Everything known about this person before you open your mouth."
    >
      <div className="grid h-[520px] grid-cols-5 gap-4">
        <Panel className="col-span-2 overflow-hidden p-0">
          <MagicCard className="flex h-full flex-col rounded-2xl p-5">
            <p className={sectionLabel}>Readiness</p>
            <div className="mt-3 flex items-center gap-4">
              <AnimatedCircularProgressBar
                value={demo.score.total}
                gaugePrimaryColor="#9A88FC"
                gaugeSecondaryColor="rgba(154,136,252,0.18)"
                className="size-28 text-xl"
              />
              <div>
                <p className="font-heading text-3xl tabular-nums text-white">{demo.score.total}</p>
                <p className="mt-1 text-xs text-dim">/ 100 · {demo.score.confidence}</p>
                <div className="mt-2 flex gap-2">
                  <StatusBadge label={demo.status} tone="brand" />
                  <StatusBadge label={demo.track} tone="good" />
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {demo.score.factors.map((factor) => (
                <Progress
                  key={factor.key}
                  label={factor.label}
                  value={factor.value}
                  valueLabel={String(factor.value)}
                  tone={factor.value >= 75 ? "good" : factor.value >= 60 ? "brand" : "warning"}
                />
              ))}
            </div>
          </MagicCard>
        </Panel>
        <div className="col-span-3 flex flex-col gap-4">
          <Panel className="p-5">
            <p className={sectionLabel}>Open objections</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge label={demo.objection.type} tone="warning" />
              <span className="text-xs text-dim">{demo.objection.source}</span>
            </div>
            <p className="mt-2 text-sm text-white">“{demo.objection.verbatim}”</p>
          </Panel>
          <Panel className="min-h-0 flex-1 p-5">
            <p className={sectionLabel}>Touch history</p>
            <ul className="mt-3 space-y-3">
              {demo.touches.slice(0, 3).map((touch) => (
                <li key={`${touch.when}-${touch.channel}`} className="flex items-start justify-between gap-3">
                  <p className="text-sm text-white">
                    {touch.channel}
                    <span className="ml-2 text-dim">
                      {touch.who} · {touch.when}
                    </span>
                  </p>
                  <p className="max-w-sm text-right text-xs text-silver">{touch.detail}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </PreviewShell>
  );
}

function BriefShot() {
  const demo = DEMO_CASE;
  return (
    <PreviewShell
      shot="brief"
      title="Pre-call brief"
      description="Ninety seconds. Gaps stay visible."
    >
      <div className="grid grid-cols-4 gap-3">
        <Panel className="px-4 py-3">
          <p className={sectionLabel}>Who</p>
          <p className="mt-1 text-base font-semibold text-white">{demo.name}</p>
          <p className="mt-1 text-xs text-silver">{demo.source}</p>
          <p className="mt-1 text-xs text-dim">{demo.campaign}</p>
        </Panel>
        <Panel className="px-4 py-3">
          <p className={sectionLabel}>Readiness</p>
          <p className="mt-1 font-heading text-base tabular-nums text-white">
            {demo.score.total} · {demo.track}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-silver">
            Timeline {demo.score.factors[0].value} · Investment {demo.score.factors[1].value} ·
            Authority {demo.score.factors[2].value} · Pain {demo.score.factors[3].value}
          </p>
        </Panel>
        <Panel className="col-span-2 px-4 py-3">
          <p className={sectionLabel}>What the setter established</p>
          <p className="mt-1 text-sm text-silver">{demo.brief.setter}</p>
        </Panel>
        <Panel className="col-span-2 px-4 py-3">
          <p className={sectionLabel}>Open objections</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge label={demo.objection.type} tone="warning" />
            <span className="text-xs text-dim">{demo.objection.source}</span>
          </div>
          <p className="mt-2 text-sm text-white">“{demo.objection.verbatim}”</p>
        </Panel>
        <Panel className="col-span-2 px-4 py-3">
          <p className={sectionLabel}>In their words</p>
          <p className="mt-2 text-sm text-white">“{demo.brief.quote}”</p>
          <p className="mt-2 text-xs text-dim">{demo.transcript.title}</p>
        </Panel>
      </div>
    </PreviewShell>
  );
}

function FollowUpShot() {
  const demo = DEMO_CASE;
  return (
    <PreviewShell
      shot="follow-up"
      title="Follow-up draft"
      description="Vistrial drafts. You approve. The CRM sends."
    >
      <div className="grid grid-cols-2 gap-4">
        <Panel className="overflow-hidden p-0">
          <MagicCard className="rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-lg text-white">{demo.name}</p>
                <p className="mt-1 text-sm text-silver">Objection hold · Email</p>
              </div>
              <StatusBadge label="Pending review" tone="neutral" />
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-dim">Recipient</dt>
                <dd className="text-white">{demo.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-dim">Expires</dt>
                <dd className="text-white">in 18 hours</dd>
              </div>
            </dl>
            <div className="mt-5">
              <p className={sectionLabel}>Subject</p>
              <p className="mt-1.5 rounded-xl border border-white/[0.09] bg-ink-850 px-3 py-2 text-sm text-white">
                After the Q4 launch — and bringing your spouse
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="primary" size="sm">
                Approve
              </Button>
              <Button type="button" variant="secondary" size="sm">
                Reject
              </Button>
            </div>
          </MagicCard>
        </Panel>
        <Panel className="p-5">
          <p className={sectionLabel}>Draft</p>
          <p className="mt-1 text-xs text-dim">Free editing. Nothing sends until you approve this one.</p>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-white">{demo.followUp.body}</p>
        </Panel>
      </div>
    </PreviewShell>
  );
}

export function MarketplaceShotFrame({ shot }: { shot: MarketplaceShot }) {
  switch (shot) {
    case "queue":
      return <QueueShot />;
    case "case":
      return <CaseShot />;
    case "brief":
      return <BriefShot />;
    case "follow-up":
      return <FollowUpShot />;
  }
}
