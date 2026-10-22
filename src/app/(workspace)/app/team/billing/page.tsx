import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { getAuthContext } from "@/lib/auth/session";
import { LIMIT_REVIEW_ON } from "@/lib/billing/rules";
import { formatPlanPrice } from "@/lib/billing/labels";
import { createClient } from "@/lib/supabase/server";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

type Account = {
  org_id: string;
  state: string;
  plan_id: string;
  quoted_price_cents: number | null;
  single_admin_approval: boolean;
};

type Revenue = {
  mrr_cents: number;
  arr_cents: number;
  review_on: string;
  margin_note: string;
  recorded_cost_micros: number;
  states: Record<string, number>;
  by_plan: Array<{ plan: string; workspaces: number; mrr_cents: number }>;
  accounts: Account[];
};

export default async function PlatformBillingPage() {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) notFound();
  const db = (await createClient()) as unknown as SupabaseClient;
  const [{ data: revenue }, { data: catalog }] = await Promise.all([
    db.rpc("billing_revenue"),
    db.rpc("billing_public_catalog"),
  ]);
  const view = (revenue ?? null) as Revenue | null;
  const rows = view?.accounts ?? [];
  const cost = view ? view.recorded_cost_micros / 1_000_000 : 0;

  return (
    <PageFrame title="Billing" description="Plans, usage, and revenue. Internal and pilot workspaces are left out of revenue.">
      <Panel className="p-6">
        <h2 className={cardTitle}>Limit review</h2>
        <p className="mt-2 text-sm text-strong">
          Review Private Access limits on {view?.review_on ?? LIMIT_REVIEW_ON}, after 30 days of measured cost. Resets use America/New_York.
        </p>
        <p className={`mt-2 ${helperClass}`}>{view?.margin_note}</p>
        <p className={`mt-2 ${helperClass}`}>
          Stripe Tax on the live account was already active when this was reviewed. This build does not add its own tax math. Invoices work with tax off. To calculate tax, keep a head office, tax registrations, and a default product tax code in Stripe, then turn stripe_tax_enabled on in billing settings.
        </p>
      </Panel>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="p-6">
          <h2 className={cardTitle}>Monthly recurring revenue</h2>
          <p className="mt-2 text-sm text-strong">{view ? formatPlanPrice(view.mrr_cents, "usd", "month", 1) : "Not available"}</p>
          <p className={helperClass}>Annualized {view ? formatPlanPrice(view.arr_cents, "usd", null, null) : ""}. Active, past due, and canceling only.</p>
        </Panel>
        <Panel className="p-6">
          <h2 className={cardTitle}>Recorded cost</h2>
          <p className="mt-2 text-sm text-strong">{cost.toLocaleString("en-US", { style: "currency", currency: "USD" })}</p>
          <p className={helperClass}>Provider usage already stored. Gaps are not filled in.</p>
        </Panel>
        <Panel className="p-6">
          <h2 className={cardTitle}>Workspaces</h2>
          <ul className="mt-2 space-y-1 text-sm text-strong">
            {view
              ? Object.entries(view.states).map(([state, count]) => (
                  <li key={state}>
                    {state.replaceAll("_", " ")}: {count}
                  </li>
                ))
              : null}
          </ul>
        </Panel>
      </div>

      <Panel className="p-6">
        <h2 className={cardTitle}>By plan</h2>
        <ul className="mt-2 space-y-1 text-sm text-strong">
          {(view?.by_plan ?? []).map((row) => (
            <li key={row.plan}>
              {row.plan}: {row.workspaces} workspace{row.workspaces === 1 ? "" : "s"}, {formatPlanPrice(row.mrr_cents, "usd", "month", 1)}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Public catalog data</h2>
        <p className={helperClass}>The landing page does not read this yet. Prompt 17 will. Layout stays as it is.</p>
        <pre className="mt-3 overflow-x-auto text-xs text-strong/80">{JSON.stringify(catalog ?? [], null, 2)}</pre>
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Assignments</h2>
        <ul className="mt-2 space-y-1 text-sm text-strong">
          {rows.map((row) => (
            <li key={row.org_id}>
              {row.plan_id} · {row.state.replaceAll("_", " ")}
              {row.quoted_price_cents != null ? ` · ${formatPlanPrice(row.quoted_price_cents, "usd", "month", 1)}` : ""}
              {row.single_admin_approval ? " · single-admin approval" : ""}
            </li>
          ))}
        </ul>
        <p className={`mt-3 ${helperClass}`}>
          Quotes under $97 need a second Platform Admin once two are active. Until then the same admin can approve, and the audit row is marked single-admin approval. Credits and refunds above one month of price follow the same rule. Service Team cannot issue them.
        </p>
      </Panel>
    </PageFrame>
  );
}
