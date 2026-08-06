import { PortalShell } from "@/components/portal/shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { TonePill } from "@/components/ui/tone";
import { requireClient } from "@/lib/auth";
import { listCharges } from "@/lib/db/billing";
import { loadPortalDashboard } from "@/lib/db/portal";
import { formatDay, formatMoney, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalBillingPage() {
  const session = await requireClient();
  const dashboard = await loadPortalDashboard(session.membership.client_id);
  const charges = await listCharges({ clientId: session.membership.client_id });

  return (
    <PortalShell
      clientName={dashboard.client.name}
      active="/portal/billing"
      readOnly={session.readOnly}
    >
      <header className="mb-7">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-brand-500 uppercase">
          Billing
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Charges</h1>
        <p className="mt-2 max-w-2xl text-sm text-silver">
          The same itemisation you were shown before each charge. Nothing here
          can be edited from the portal.
        </p>
      </header>

      {charges.length === 0 ? (
        <EmptyState
          title="No charges yet."
          detail="A charge appears after its pre-charge notice is prepared for a closed cycle."
        />
      ) : (
        <div className="space-y-4">
          {charges.map((charge) => (
            <Panel key={charge.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">
                    {formatDay(charge.period_start)} – {formatDay(charge.period_end)}
                  </p>
                  <p className="mt-1 text-xs text-dim">
                    {charge.appointment_count} appointment
                    {charge.appointment_count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums text-white">
                    {formatMoney(charge.total)}
                  </p>
                  <TonePill
                    tone={
                      charge.status === "paid"
                        ? "good"
                        : charge.status === "failed"
                          ? "critical"
                          : "neutral"
                    }
                  >
                    {titleCase(charge.status)}
                  </TonePill>
                </div>
              </div>

              {(charge.lines ?? []).length > 0 ? (
                <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
                  {(charge.lines ?? []).map((line) => (
                    <li
                      key={line.id}
                      className="flex justify-between gap-4 text-sm text-silver"
                    >
                      <span>{line.description}</span>
                      <span className="tabular-nums text-white">
                        {formatMoney(line.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Panel>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
