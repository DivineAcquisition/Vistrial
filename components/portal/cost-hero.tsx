import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Panel } from "@/components/ui/panel";
import { TonePill } from "@/components/ui/tone";
import { formatDay, formatMoney } from "@/lib/format";
import type { CostBreakdown } from "@/lib/portal/cpa";

export function CostHero({ cost }: { cost: CostBreakdown }) {
  const available = cost.costPerAppointment !== null;

  return (
    <div className="space-y-4">
      <Panel className="border-t-2 border-t-brand-500 px-6 py-7">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-brand-300 uppercase">
          Combined cost per appointment
        </p>
        <p className="mt-1 text-xs text-dim">
          {formatDay(cost.period.start)} – {formatDay(cost.period.end)}
        </p>
        <p
          className={`mt-4 text-4xl font-semibold tabular-nums sm:text-5xl ${
            available ? "text-white" : "text-dim"
          }`}
        >
          {available ? formatMoney(cost.costPerAppointment!) : "Unavailable"}
        </p>
        {!available ? (
          <p className="mt-3 max-w-xl text-sm text-silver">
            {cost.unavailableReason}
          </p>
        ) : (
          <p className="mt-3 max-w-xl text-sm text-silver">
            Ad spend and Divine Acquisition fees, divided by confirmed
            appointments in this period.
          </p>
        )}
      </Panel>

      <KpiGrid columns={3}>
        <KpiCard
          label="Ad spend"
          value={formatMoney(cost.adSpend)}
          sub={
            cost.missingSpendDays.length > 0
              ? `${cost.missingSpendDays.length} day(s) missing`
              : "Complete for the period"
          }
          tone={cost.missingSpendDays.length > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label="Divine Acquisition fees"
          value={formatMoney(cost.daFees)}
          sub="Charges that left draft"
        />
        <KpiCard
          label="Confirmed appointments"
          value={String(cost.confirmedCount)}
          tone="brand"
        />
      </KpiGrid>

      {cost.missingSpendDays.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <TonePill tone="warning">Spend incomplete</TonePill>
          <p className="text-xs text-dim">
            A missing day is unknown, not zero — the combined figure stays
            unavailable until every day is entered.
          </p>
        </div>
      ) : null}
    </div>
  );
}
