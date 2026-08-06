import {
  CreditDialog,
  PaymentLinkButton,
  RefreshPaymentMethodButton,
} from "@/components/billing/actions";
import { ChargesTable } from "@/components/billing/charges-table";
import { toChargeRow } from "@/components/billing/types";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { TonePill } from "@/components/ui/tone";
import type { ChargeRecord, NextCharge } from "@/lib/db/billing";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import { btnSecondary, btnSizeSm } from "@/lib/ui";
import type { Client, Credit } from "@/types/database";

const DASH = "\u2014";

function expiryTone(client: Client): "good" | "warning" | "critical" {
  if (client.card_exp_month === null || client.card_exp_year === null) return "warning";

  const expiry = Date.UTC(client.card_exp_year, client.card_exp_month, 0, 23, 59, 59);
  if (expiry <= Date.now()) return "critical";
  if (expiry <= Date.now() + 30 * 24 * 60 * 60 * 1000) return "warning";
  return "good";
}

export function ClientBilling({
  client,
  charges,
  credits,
  next,
}: {
  client: Client;
  charges: ChargeRecord[];
  credits: Credit[];
  next: NextCharge;
}) {
  const hasMethod = client.stripe_payment_method_id !== null;
  const tone = expiryTone(client);
  const unapplied = credits.filter((credit) => credit.applied_charge_id === null);

  return (
    <div className="space-y-8">
      <div>
        <SectionHeader
          title="Payment method"
          hint="Captured through Stripe's own hosted page. Vistrial never sees a card number."
        />

        {hasMethod ? (
          <Panel className="px-5 py-2">
            <DefinitionList>
              <KeyValue label="Card">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="capitalize">{client.card_brand ?? "Card"}</span>
                  <span className="font-mono">•••• {client.card_last4 ?? "????"}</span>
                  <TonePill tone={tone}>
                    {client.card_exp_month !== null && client.card_exp_year !== null
                      ? `Expires ${String(client.card_exp_month).padStart(2, "0")}/${client.card_exp_year}`
                      : "Expiry unknown"}
                  </TonePill>
                </span>
              </KeyValue>
              <KeyValue label="Added">
                {client.payment_method_added_at
                  ? formatDateTime(client.payment_method_added_at)
                  : DASH}
              </KeyValue>
              <KeyValue label="Processor references">
                <span className="block font-mono text-xs text-dim">
                  {client.stripe_customer_id}
                </span>
                <span className="block font-mono text-xs text-dim">
                  {client.stripe_payment_method_id}
                </span>
              </KeyValue>
              <KeyValue label="Replace it">
                <PaymentLinkButton clientId={client.id} label="Send a new secure link" />
              </KeyValue>
            </DefinitionList>
          </Panel>
        ) : (
          <Panel className="border-l-2 border-l-flag-critical px-5 py-4">
            <TonePill tone="critical">No payment method on file</TonePill>
            <p className="mt-3 text-sm leading-relaxed text-silver">
              This client cannot be made active and nothing can be collected from
              them. Appointments still accumulate and will be charged once a method
              exists, so no work is blocked — but the gap shows in the attention view
              every day it persists.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <PaymentLinkButton clientId={client.id} />
              {client.payment_setup_session_id ? (
                <RefreshPaymentMethodButton clientId={client.id} />
              ) : null}
            </div>
          </Panel>
        )}
      </div>

      <div>
        <SectionHeader
          title="Next charge"
          hint="The running total of what the coming cycle will collect, as appointments come out of their review windows."
        />
        <KpiGrid>
          <KpiCard
            label="Cycle closes"
            value={next.closesOn ? formatDay(next.closesOn) : "Not running"}
            tone="brand"
            sub={
              client.activated_at
                ? `Every ${client.billing_cycle_days} days from activation`
                : "The cycle starts when the client is made active"
            }
          />
          <KpiCard
            label="Locked for this cycle"
            value={String(next.lockedCount)}
            tone="good"
            sub="Review window elapsed, not yet charged"
          />
          <KpiCard
            label="Running value"
            value={formatMoney(next.lockedValue)}
            tone="brand"
            sub={`At ${formatMoney(Number(client.rate_per_appointment))} each`}
          />
          <KpiCard
            label="Still in their window"
            value={String(next.inWindowCount)}
            tone="warning"
            sub="Carries into a later cycle, not this one"
          />
        </KpiGrid>
      </div>

      <div>
        <SectionHeader
          title="Credits"
          hint="A processed charge never changes, so a correction is a credit against the next one."
          actions={
            <CreditDialog
              clientId={client.id}
              trigger={
                <button type="button" className={`${btnSecondary} ${btnSizeSm}`}>
                  Credit this client
                </button>
              }
            />
          }
        />

        {credits.length === 0 ? (
          <p className="text-sm text-dim">None recorded.</p>
        ) : (
          <ul className="space-y-2">
            {credits.map((credit) => (
              <li
                key={credit.id}
                className="rounded-2xl border border-border bg-white/[0.02] px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <TonePill tone={credit.applied_charge_id === null ? "warning" : "good"}>
                    {formatMoney(Number(credit.amount))}
                  </TonePill>
                  <span className="text-xs text-dim">
                    {credit.applied_charge_id === null
                      ? "Waiting for the next charge"
                      : `Applied ${credit.applied_at ? formatDateTime(credit.applied_at) : ""}`}
                  </span>
                  <span className="ml-auto text-xs text-dim tabular-nums">
                    {formatDateTime(credit.created_at)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-silver">{credit.reason}</p>
              </li>
            ))}
          </ul>
        )}

        {unapplied.length > 0 ? (
          <p className="mt-3 text-xs text-dim">
            {formatMoney(
              unapplied.reduce((sum, credit) => sum + Number(credit.amount), 0)
            )}{" "}
            comes off the next charge.
          </p>
        ) : null}
      </div>

      <div>
        <SectionHeader title="Charges" hint={`Newest first. ${charges.length} on record.`} />
        {charges.length === 0 ? (
          <EmptyState
            title="No charges yet."
            detail="One appears when this client's cycle closes with appointments that have come out of their review window."
          />
        ) : (
          <ChargesTable rows={charges.map(toChargeRow)} />
        )}
      </div>
    </div>
  );
}
