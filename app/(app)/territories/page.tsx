import nextDynamic from "next/dynamic";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { TonePill } from "@/components/ui/tone";
import type { MapTerritory } from "@/components/territory/map";
import { requireAdmin } from "@/lib/auth";
import {
  listMapTerritories,
  listServiceCategories,
} from "@/lib/db/territory";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TerritoryMap = nextDynamic(
  () => import("@/components/territory/map").then((mod) => mod.TerritoryMap),
  {
    ssr: false,
    loading: () => (
      <Panel className="px-5 py-10 text-sm text-dim">Loading map…</Panel>
    ),
  }
);

export default async function TerritoriesPage() {
  await requireAdmin();

  let territories: MapTerritory[] = [];
  let categories: { id: string; name: string; slug: string }[] = [];
  let connected = true;

  try {
    const [rows, categoryRows] = await Promise.all([
      listMapTerritories(),
      listServiceCategories({ activeOnly: true }),
    ]);

    const db = createServiceClient();
    const clientIds = [
      ...new Set(rows.map((row) => row.client?.id).filter(Boolean) as string[]),
    ];

    const volumes = new Map<string, number>();
    await Promise.all(
      clientIds.map(async (clientId) => {
        const { count } = await db
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId);
        volumes.set(clientId, count ?? 0);
      })
    );

    territories = rows.map((row) => ({
      ...row,
      appointmentVolume: row.client ? volumes.get(row.client.id) ?? 0 : 0,
    }));
    categories = categoryRows.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
    }));
  } catch {
    connected = false;
  }

  if (!connected) {
    return (
      <>
        <PageHeader eyebrow="Exclusivity" title="Territory map" />
        <Panel className="px-5 py-4">
          <TonePill tone="warning">Supabase not connected</TonePill>
          <p className="mt-3 text-sm text-silver">
            Apply migration 011 and check .env.local.
          </p>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Exclusivity"
        title="Territory map"
        description="Active clients and the territories Divine Acquisition sold them. Filter by service category to see where you already have someone — and where you are open."
      />
      <TerritoryMap territories={territories} categories={categories} />
    </>
  );
}
