import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import type { CommsView } from "@/lib/forsight/dashboard";
import type { SpendToday } from "@/lib/forsight/spend-today";
import { formatNumber } from "@/lib/forsight/values";

/**
 * Today's spend, read live from Meta. Marked as such on the card, because
 * every other figure on this page is a week-to-date number and this one is
 * not.
 */
export function SpendTodayCard({ spend }: { spend: SpendToday }) {
  if (spend.state === "not_tracked") return null;

  return (
    <Panel className="p-4">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">Spend today</p>
      {spend.state === "ok" ? (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {formatNumber(spend.spend, "currency")}
          </p>
          <p className="mt-1 text-xs text-dim">Live from Meta. Today so far.</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold text-dim">Unavailable</p>
          <p className="mt-1 text-xs text-dim">{spend.reason}</p>
        </>
      )}
    </Panel>
  );
}

export function CommsSection({ comms }: { comms: CommsView }) {
  if (comms.state === "not_tracked") return null;

  return (
    <section>
      <SectionHeader
        title="This week in LeadConnector"
        hint="Appointments and message volume, read live. Counts only — Forsight never shows message content."
      />

      {comms.state === "unavailable" ? (
        <Panel className="p-5">
          <p className="text-sm text-muted-foreground">{comms.reason}</p>
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          <Panel className="p-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label="Booked" value={comms.activity.appointments.booked} />
              <Figure label="Showed" value={comms.activity.appointments.showed} />
              <Figure label="No-showed" value={comms.activity.appointments.noShowed} />
              <Figure label="Cancelled" value={comms.activity.appointments.cancelled} />
            </dl>
            <p className="mt-3 text-xs text-dim">From {comms.activity.calendarLabel}.</p>
          </Panel>

          <Panel className="p-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label="Outbound SMS" value={comms.activity.messages.outboundSms} />
              <Figure label="Outbound email" value={comms.activity.messages.outboundEmail} />
              <Figure label="Outbound other" value={comms.activity.messages.outboundOther} />
              <Figure label="Inbound replies" value={comms.activity.messages.inbound} />
            </dl>
            {comms.activity.messages.partial ? (
              <p className="mt-3 text-xs text-warning">
                LeadConnector has no way to ask for a message count, so these are counted by reading
                conversations, and this read hit its limit. Treat them as floors, not totals.
              </p>
            ) : null}
          </Panel>
        </div>
      )}
    </section>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs tracking-[0.1em] text-dim uppercase">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</dd>
    </div>
  );
}
