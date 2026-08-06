import { Suspense } from "react";

import { AttentionClientFilter } from "@/components/attention/filter";
import { AttentionList } from "@/components/attention/list";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { TonePill } from "@/components/ui/tone";
import { listAttention } from "@/lib/attention/items";
import { requireAdmin } from "@/lib/auth";
import { listClients } from "@/lib/db/clients";

export const dynamic = "force-dynamic";

export default async function AttentionPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  await requireAdmin();

  const { client: clientId } = await searchParams;

  let rows: Awaited<ReturnType<typeof listAttention>>["rows"] = [];
  let total = 0;
  let clients: { id: string; name: string }[] = [];
  let connected = true;

  try {
    const [attention, clientRows] = await Promise.all([
      listAttention({ clientId: clientId || undefined }),
      listClients(),
    ]);
    rows = attention.rows;
    total = attention.total;
    clients = clientRows.map((row) => ({ id: row.id, name: row.name }));
  } catch {
    connected = false;
  }

  if (!connected) {
    return (
      <>
        <PageHeader eyebrow="Today" title="Attention" />
        <Panel className="px-5 py-4">
          <TonePill tone="warning">Supabase not connected</TonePill>
          <p className="mt-3 text-sm text-silver">
            Check .env.local and apply the migrations in supabase/migrations.
          </p>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Today"
        title="Attention"
        description="Where to look today — ordered by money at risk and time sensitivity, never by feature area."
        actions={
          <Suspense fallback={null}>
            <AttentionClientFilter clients={clients} />
          </Suspense>
        }
      />

      <p className="mb-6 text-sm text-silver">
        {total === 0 ? (
          <>Nothing is outstanding.</>
        ) : (
          <>
            <span className="font-semibold text-white tabular-nums">{total}</span>{" "}
            {total === 1 ? "item needs" : "items need"} attention
            {clientId ? " for this client" : ""}.
          </>
        )}
      </p>

      <AttentionList rows={rows} />
    </>
  );
}
