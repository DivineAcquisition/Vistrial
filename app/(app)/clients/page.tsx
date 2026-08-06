import Link from "next/link";

import { ClientDialog } from "@/components/clients/client-dialog";
import { ClientStatusBadge } from "@/components/clients/client-status-badge";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { TonePill } from "@/components/ui/tone";
import { requireAdmin } from "@/lib/auth";
import { listClients } from "@/lib/db/clients";
import { formatDay, formatMoney } from "@/lib/format";
import { btnPrimary, btnSizeSm } from "@/lib/ui";
import type { Client } from "@/types/database";

export const dynamic = "force-dynamic";

const columns = [
  { key: "name", label: "Business" },
  { key: "status", label: "Status" },
  { key: "rate", label: "Rate", align: "right" as const },
  { key: "cycle", label: "Cycle", align: "right" as const },
  { key: "appointments", label: "Appts this cycle", align: "right" as const },
  { key: "created", label: "Created", align: "right" as const },
];

async function loadClients(): Promise<
  { ok: true; clients: Client[] } | { ok: false }
> {
  try {
    return { ok: true, clients: await listClients() };
  } catch {
    return { ok: false };
  }
}

export default async function ClientsPage() {
  await requireAdmin();
  const result = await loadClients();

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title="Clients"
        description="Commercial terms live here: the rate per appointment, the monthly minimum, the billing cycle, and how long the client has to review."
        actions={
          <ClientDialog
            mode="create"
            trigger={
              <button type="button" className={`${btnPrimary} ${btnSizeSm}`}>
                Add Client
              </button>
            }
          />
        }
      />

      {result.ok ? (
        <>
          <SectionHeader title="Accounts" hint="Newest first." />
          <DataTable
            columns={columns}
            rows={result.clients.map((client) => ({
              name: (
                <Link
                  href={`/clients/${client.id}`}
                  className="text-white underline-offset-4 hover:text-brand-500 hover:underline"
                >
                  {client.name}
                </Link>
              ),
              status: <ClientStatusBadge status={client.status} />,
              rate: formatMoney(client.rate_per_appointment),
              cycle: `${client.billing_cycle_days} days`,
              appointments: <span className="text-dim">—</span>,
              created: formatDay(client.created_at),
            }))}
            empty="No clients yet. Add your first client to begin."
          />
        </>
      ) : (
        <Panel className="px-5 py-4">
          <TonePill tone="warning">Supabase not connected</TonePill>
          <p className="mt-3 text-sm leading-relaxed text-silver">
            Check .env.local and run migration 001.
          </p>
        </Panel>
      )}
    </>
  );
}
