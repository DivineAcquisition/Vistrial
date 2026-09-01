import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tone } from "@/components/ui/tone";
import { daysSince, type LeadRow, type PipelineHealth } from "@/lib/forsight/pipeline";

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function waitedFor(lead: LeadRow, now: Date): string {
  const days = daysSince(lead.optInDate, now);
  if (days === null) return "No opt-in date";
  if (days === 0) return "Opted in today";
  return `${plural(days, "day")} since opt-in`;
}

function silentFor(lead: LeadRow): string {
  if (lead.daysSinceTouch === null) return "Never touched";
  if (lead.daysSinceTouch === 0) return "Touched today";
  return `${plural(lead.daysSinceTouch, "day")} since last touch`;
}

/**
 * One lead, with the Next Action text Airtable already wrote for it. The page
 * surfaces the queue; the base decides what belongs in it.
 */
function Lead({ lead, meta }: { lead: LeadRow; meta: string }) {
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium text-card-foreground">{lead.name}</span>
        <span className="text-xs text-dim">
          {meta}
          {lead.readinessScore === null ? "" : ` · readiness ${lead.readinessScore}`}
        </span>
      </div>
      {lead.nextAction ? <p className="text-sm text-silver">{lead.nextAction}</p> : null}
    </li>
  );
}

function LeadList({ leads, meta }: { leads: LeadRow[]; meta: (lead: LeadRow) => string }) {
  return (
    <ul className="divide-y divide-white/[0.05]">
      {leads.map((lead) => (
        <Lead key={lead.id} lead={lead} meta={meta(lead)} />
      ))}
    </ul>
  );
}

function Count({ value, tone, label }: { value: number; tone: Tone; label: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-3xl font-semibold tabular-nums text-white">{value}</span>
      <StatusBadge label={label} tone={tone} />
    </div>
  );
}

export function PipelineScreen({ health, now }: { health: PipelineHealth; now: Date }) {
  const { neverContacted, goingQuiet, debriefsMissing } = health;
  const quiet30 = goingQuiet.ghosted30;
  const quiet14 = goingQuiet.ghosted14;
  const quietTotal = quiet30.length + quiet14.length;

  return (
    <>
      <section>
        <SectionHeader
          title="Never contacted"
          hint="Qualified, still in play, and no human has spoken to them yet."
        />
        <Panel className="p-5">
          {neverContacted.length === 0 ? (
            <>
              <Count value={0} tone="good" label="All reached" />
              <p className="mt-3 text-sm text-muted-foreground">
                Every qualified lead has been contacted by a person. This is the section that
                justifies the whole system, and today it is empty.
              </p>
            </>
          ) : (
            <>
              <Count
                value={neverContacted.length}
                tone="critical"
                label="Waiting on a first call"
              />
              <div className="mt-4">
                <LeadList leads={neverContacted} meta={(lead) => waitedFor(lead, now)} />
              </div>
            </>
          )}
        </Panel>
      </section>

      <section>
        <SectionHeader
          title="Going quiet"
          hint="Active leads by how long they have been silent."
        />
        {quietTotal === 0 ? (
          <Panel className="p-5">
            <Count value={0} tone="good" label="Nobody drifting" />
            <p className="mt-3 text-sm text-muted-foreground">
              No active lead has gone more than a fortnight without contact.
            </p>
          </Panel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="p-5">
              <Count value={quiet30.length} tone="critical" label="Silent 30+ days" />
              {quiet30.length > 0 ? (
                <div className="mt-4">
                  <LeadList leads={quiet30} meta={silentFor} />
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Nobody in this bucket.</p>
              )}
            </Panel>
            <Panel className="p-5">
              <Count value={quiet14.length} tone="warning" label="Silent 14+ days" />
              {quiet14.length > 0 ? (
                <div className="mt-4">
                  <LeadList leads={quiet14} meta={silentFor} />
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Nobody in this bucket.</p>
              )}
            </Panel>
          </div>
        )}
      </section>

      <section>
        <SectionHeader
          title="Debriefs missing"
          hint="An audit was held and nobody wrote it up."
        />
        <Panel className="p-5">
          {debriefsMissing.length === 0 ? (
            <>
              <Count value={0} tone="good" label="All written up" />
              <p className="mt-3 text-sm text-muted-foreground">
                Every held audit has a debrief against it.
              </p>
            </>
          ) : (
            <>
              <Count value={debriefsMissing.length} tone="warning" label="Awaiting a debrief" />
              <div className="mt-4">
                <LeadList leads={debriefsMissing} meta={(lead) => waitedFor(lead, now)} />
              </div>
            </>
          )}
        </Panel>
      </section>
    </>
  );
}
