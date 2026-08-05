import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { SectionHeader } from "@/components/ui/section-header";
import { listClients } from "@/lib/db/clients";
import type { Client } from "@/types/database";

export const dynamic = "force-dynamic";

const columns = [
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "rate", label: "Rate", align: "right" as const },
  { key: "cycle", label: "Cycle", align: "right" as const },
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

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
      <SectionHeader
        title="CLIENTS"
        action={<Button size="sm">Add Client</Button>}
      />

      {result.ok ? (
        <DataTable
          columns={columns}
          rows={result.clients.map((client) => ({
            name: client.name,
            status: client.status,
            rate: currency.format(client.rate_per_appointment),
            cycle: `${client.billing_cycle_days} days`,
          }))}
          empty="No clients yet."
        />
      ) : (
        <Alert>
          <AlertTitle className="text-warn">Supabase not connected</AlertTitle>
          <AlertDescription className="text-warn">
            Check .env.local and run migration 001.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
