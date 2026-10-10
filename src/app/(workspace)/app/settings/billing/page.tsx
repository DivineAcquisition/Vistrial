import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  LinkCustomerForm,
  ManagePaymentButton,
  RefreshBillingButton,
  UnlinkButton,
} from "@/app/(workspace)/app/settings/billing/billing-forms";
import { PageFrame } from "@/components/app/page-frame";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { mayOpenBilling } from "@/lib/auth/portal-access";
import { getAuthContext } from "@/lib/auth/session";
import {
  billingConfigured,
  billingPortalConfiguration,
  listInvoices,
  type BillingInvoice,
} from "@/lib/billing/stripe";
import { BILLING_STATUS, formatPlanPrice, limitLabel } from "@/lib/billing/labels";
import { formatDateTime, formatDayLong } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Billing" };

type BillingRow = {
  stripe_customer_id: string | null;
  status: string | null;
  plan_name: string | null;
  price_cents: number | null;
  currency: string | null;
  billing_interval: string | null;
  interval_count: number | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_end: string | null;
  payment_failed_at: string | null;
  limits: Record<string, number>;
  features: string[];
  synced_at: string | null;
};

const INVOICE_STATUS: Record<string, { label: string; tone: "good" | "warning" | "neutral" | "critical" }> = {
  paid: { label: "Paid", tone: "good" },
  open: { label: "Due", tone: "warning" },
  uncollectible: { label: "Not collected", tone: "critical" },
  void: { label: "Voided", tone: "neutral" },
};

function invoiceAmount(invoice: BillingInvoice): string {
  const cents = invoice.status === "paid" ? invoice.amountPaid : invoice.amountDue;
  return formatPlanPrice(cents, invoice.currency, null, null);
}

/**
 * What this workspace pays Vistrial. Read from Vistrial's Stripe account by the
 * team's link; anything Stripe does not hold is shown as not set up, never guessed.
 */
export default async function BillingPage() {
  const ctx = await getAuthContext();
  if (!mayOpenBilling(ctx)) notFound();
  const db = (await createClient()) as unknown as SupabaseClient;
  const [{ data: allowed }, { data }] = await Promise.all([
    db.rpc("portal_can_see_billing", { p_org_id: ctx.org.id }),
    db
      .from("workspace_billing")
      .select(
        "stripe_customer_id, status, plan_name, price_cents, currency, billing_interval, interval_count, current_period_end, cancel_at_period_end, canceled_at, trial_end, payment_failed_at, limits, features, synced_at"
      )
      .eq("org_id", ctx.org.id)
      .maybeSingle(),
  ]);
  if (allowed !== true) notFound();
  const row = data as BillingRow | null;
  const linked = Boolean(row?.stripe_customer_id);
  const invoices = linked && billingConfigured() ? await listInvoices(row!.stripe_customer_id!) : null;
  const canManage = ctx.workspaceRole === "owner" || ctx.isPlatformAdmin;
  const selfServe = Boolean(billingPortalConfiguration()) && linked;
  const status = row?.status ? (BILLING_STATUS[row.status] ?? { label: row.status, tone: "neutral" as const }) : null;
  const limits = Object.entries(row?.limits ?? {});
  const features = row?.features ?? [];

  return (
    <PageFrame title="Billing" description="Your Vistrial plan, renewal, and receipts.">
      {row?.payment_failed_at ? (
        <Alert variant="warning">
          <AlertTitle>The last payment did not go through</AlertTitle>
          <AlertDescription>
            Since {formatDayLong(row.payment_failed_at)}. Everything keeps working while this is sorted.{" "}
            {selfServe && canManage ? "Update the card below, or " : ""}
            <Link href="/app/help?topic=billing" className="underline">
              talk to your team
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      {!linked ? (
        <Panel className="space-y-2 p-6">
          <h2 className={cardTitle}>Not set up yet</h2>
          <p className={helperClass}>
            Your plan has not been linked to this workspace yet, so there is nothing to show here. Your Vistrial team sets
            this up. Nothing about your workspace depends on it in the meantime.
          </p>
          <Link href="/app/help?topic=billing" className="text-sm text-brand-300 underline">
            Ask your team about billing
          </Link>
        </Panel>
      ) : (
        <Panel className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className={cardTitle}>Plan</h2>
            {status ? <StatusBadge label={status.label} tone={status.tone} /> : null}
          </div>
          <DefinitionList>
            <KeyValue label="Plan">{row?.plan_name ?? "Not named in billing yet"}</KeyValue>
            <KeyValue label="Price">
              {row?.price_cents != null && row.currency
                ? formatPlanPrice(row.price_cents, row.currency, row.billing_interval, row.interval_count)
                : "Not set in billing yet"}
            </KeyValue>
            {row?.trial_end && row.status === "trialing" ? (
              <KeyValue label="Trial ends">{formatDayLong(row.trial_end)}</KeyValue>
            ) : null}
            <KeyValue label={row?.cancel_at_period_end || row?.canceled_at ? "Ends" : "Renews"}>
              {row?.current_period_end ? formatDayLong(row.current_period_end) : "No renewal date yet"}
            </KeyValue>
            {limits.length ? (
              <KeyValue label="Included">
                <ul className="space-y-1">
                  {limits.map(([key, value]) => (
                    <li key={key}>
                      {value.toLocaleString("en-US")} {limitLabel(key)}
                    </li>
                  ))}
                </ul>
              </KeyValue>
            ) : null}
            {features.length ? (
              <KeyValue label="Features">
                <ul className="list-disc space-y-1 pl-5">
                  {features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </KeyValue>
            ) : null}
          </DefinitionList>
          <div className="mt-4 flex flex-wrap items-start gap-3">
            {selfServe && canManage ? <ManagePaymentButton /> : null}
            <RefreshBillingButton />
          </div>
          {row?.synced_at ? <p className={`mt-3 ${helperClass}`}>Checked with billing {formatDateTime(row.synced_at)} UTC.</p> : null}
        </Panel>
      )}

      {linked ? (
        <Panel className="p-6">
          <h2 className={cardTitle}>Receipts</h2>
          {!invoices ? (
            <p className={`mt-2 ${helperClass}`}>Receipts show here once billing is connected.</p>
          ) : !invoices.ok ? (
            <p className={`mt-2 ${helperClass}`}>Receipts could not be loaded just now. Try again in a minute.</p>
          ) : invoices.data.length === 0 ? (
            <p className={`mt-2 ${helperClass}`}>No receipts yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {invoices.data.map((invoice) => {
                const label = INVOICE_STATUS[invoice.status ?? ""] ?? { label: invoice.status ?? "Unknown", tone: "neutral" as const };
                const href = invoice.hostedUrl ?? invoice.pdfUrl;
                return (
                  <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="min-w-0">
                      <span className="block text-sm text-white">
                        {formatDayLong(invoice.created)} · {invoiceAmount(invoice)}
                      </span>
                      {invoice.number ? <span className={helperClass}>{invoice.number}</span> : null}
                    </span>
                    <span className="flex items-center gap-3">
                      <StatusBadge label={label.label} tone={label.tone} />
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer" className="text-sm text-brand-300 underline">
                          View
                        </a>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      ) : null}

      <Panel className="space-y-2 p-6">
        <h2 className={cardTitle}>Changing or cancelling</h2>
        <p className={helperClass}>
          To change your plan or cancel,{" "}
          <Link href="/app/help?topic=billing" className="underline">
            talk to your team
          </Link>
          . They will confirm the date it takes effect before anything changes.
        </p>
        <p className={helperClass}>
          Cancelling does not delete anything. Your case files and history are kept until you ask for them to be deleted,
          and you can ask for a full copy first, both from{" "}
          <Link href="/app/settings/privacy" className="underline">
            Privacy
          </Link>
          . Vistrial never touches the records in your CRM.
        </p>
      </Panel>

      {ctx.isPlatformAdmin ? (
        <section className="space-y-3">
          <h2 className={cardTitle}>Link (Platform Admin)</h2>
          {!billingConfigured() ? (
            <p className={helperClass}>STRIPE_SECRET_KEY is not set, so billing cannot be read yet.</p>
          ) : null}
          <LinkCustomerForm current={row?.stripe_customer_id ?? null} />
          {linked ? <UnlinkButton /> : null}
        </section>
      ) : null}
    </PageFrame>
  );
}
