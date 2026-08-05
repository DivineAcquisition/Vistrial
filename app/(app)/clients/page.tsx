import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { TonePill, type Tone } from "@/components/ui/tone";
import { listClients } from "@/lib/db/clients";
import { formatMoney } from "@/lib/format";
import { btnPrimary, btnSizeSm } from "@/lib/ui";
import type { Client, ClientStatus } from "@/types/database";

export const dynamic = "force-dynamic";

const columns = [
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "rate", label: "Rate", align: "right" as const },
  { key: "cycle", label: "Cycle", align: "right" as const },
];

const STATUS_TONES: Record<ClientStatus, Tone> = {
  Onboarding: "warning",
  Active: "good",
  Paused: "neutral",
  Churned: "critical",
};

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
  const result = await loadClients();

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title="Clients"
        description="Commercial terms live here: the rate per appointment, the monthly minimum, the billing cycle, and how long the client has to review."
        actions={
          <button type="button" className={`${btnPrimary} ${btnSizeSm}`}>
            Add client
          </button>
        }
      />

      {result.ok ? (
        <>
          <SectionHeader title="Accounts" hint="Newest first." />
          <DataTable
            columns={columns}
            rows={result.clients.map((client) => ({
              name: client.name,
              status: (
                <TonePill tone={STATUS_TONES[client.status]}>
                  {client.status}
                </TonePill>
              ),
              rate: formatMoney(client.rate_per_appointment),
              cycle: `${client.billing_cycle_days} days`,
            }))}
            empty="No clients yet."
          />
        </>
      ) : (
        <Panel className="px-5 py-4">
          <TonePill tone="warning">Supabase not connected</TonePill>
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            Check .env.local and run migration 001.
          </p>
        </Panel>
      )}
    </>
  );
}
