import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { LedgerDb } from "@/lib/supabase/ledger";
import type {
  Client,
  ClientCategory,
  CrossClientMatch,
  ExclusivityOverride,
  ExclusivityStatus,
  ServiceCategory,
  Territory,
} from "@/types/database";

export async function listServiceCategories(
  options: { activeOnly?: boolean } = {}
): Promise<ServiceCategory[]> {
  const db = createServiceClient();
  let query = db.from("service_categories").select("*").order("sort", { ascending: true });
  if (options.activeOnly) query = query.eq("active", true);

  const { data, error } = await query.returns<ServiceCategory[]>();
  if (error) throw new Error(`Failed to list categories: ${error.message}`);
  return data ?? [];
}

export async function createServiceCategory(input: {
  name: string;
  slug: string;
}): Promise<ServiceCategory> {
  const db = createServiceClient();
  const { data: last } = await db
    .from("service_categories")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db
    .from("service_categories")
    .insert({
      name: input.name,
      slug: input.slug,
      sort: (last?.sort ?? 0) + 10,
      active: true,
    })
    .select("*")
    .returns<ServiceCategory[]>()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function setCategoryActive(
  id: string,
  active: boolean
): Promise<void> {
  const db = createServiceClient();
  const { error } = await db
    .from("service_categories")
    .update({ active })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listClientCategoryIds(clientId: string): Promise<string[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("client_categories")
    .select("category_id")
    .eq("client_id", clientId)
    .returns<Pick<ClientCategory, "category_id">[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.category_id);
}

export async function listTerritories(clientId: string): Promise<Territory[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("territories")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true })
    .returns<Territory[]>();

  if (error) throw new Error(`Failed to list territories: ${error.message}`);
  return data ?? [];
}

export async function listOverridesForClient(
  clientId: string
): Promise<ExclusivityOverride[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("exclusivity_overrides")
    .select("*")
    .or(`client_a_id.eq.${clientId},client_b_id.eq.${clientId}`)
    .order("created_at", { ascending: false })
    .returns<ExclusivityOverride[]>();

  if (error) throw new Error(error.message);
  return data ?? [];
}

export type ActiveExclusivityPeer = {
  client: Pick<Client, "id" | "name" | "status" | "exclusivity_status">;
  categoryIds: string[];
  territories: Territory[];
};

/** Active clients with their categories and territories — the conflict pool. */
export async function listActiveExclusivityPeers(
  excludeClientId?: string
): Promise<ActiveExclusivityPeer[]> {
  const db = createServiceClient();

  let clientsQuery = db
    .from("clients")
    .select("id, name, status, exclusivity_status")
    .eq("status", "Active");
  if (excludeClientId) clientsQuery = clientsQuery.neq("id", excludeClientId);

  const { data: clients, error } = await clientsQuery.returns<
    Pick<Client, "id" | "name" | "status" | "exclusivity_status">[]
  >();
  if (error) throw new Error(error.message);

  const list = clients ?? [];
  if (list.length === 0) return [];

  const ids = list.map((client) => client.id);

  const [{ data: categories }, { data: territories }] = await Promise.all([
    db
      .from("client_categories")
      .select("client_id, category_id")
      .in("client_id", ids)
      .returns<ClientCategory[]>(),
    db
      .from("territories")
      .select("*")
      .in("client_id", ids)
      .returns<Territory[]>(),
  ]);

  const catsByClient = new Map<string, string[]>();
  for (const row of categories ?? []) {
    const listFor = catsByClient.get(row.client_id) ?? [];
    listFor.push(row.category_id);
    catsByClient.set(row.client_id, listFor);
  }

  const terrByClient = new Map<string, Territory[]>();
  for (const row of territories ?? []) {
    const listFor = terrByClient.get(row.client_id) ?? [];
    listFor.push(row);
    terrByClient.set(row.client_id, listFor);
  }

  return list.map((client) => ({
    client,
    categoryIds: catsByClient.get(client.id) ?? [],
    territories: terrByClient.get(client.id) ?? [],
  }));
}

export async function countClientsSharingCategories(
  categoryIds: string[],
  excludeClientId: string
): Promise<number> {
  if (categoryIds.length === 0) return 0;
  const db = createServiceClient();

  const { data, error } = await db
    .from("client_categories")
    .select("client_id, client:clients!inner(status)")
    .in("category_id", categoryIds)
    .neq("client_id", excludeClientId)
    .eq("client.status", "Active")
    .returns<{ client_id: string }[]>();

  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.client_id)).size;
}

export async function replaceClientCategories(
  db: LedgerDb,
  clientId: string,
  categoryIds: string[]
): Promise<void> {
  const { error: delError } = await db
    .from("client_categories")
    .delete()
    .eq("client_id", clientId);
  if (delError) throw new Error(delError.message);

  if (categoryIds.length === 0) return;

  const { error } = await db.from("client_categories").insert(
    categoryIds.map((category_id) => ({ client_id: clientId, category_id }))
  );
  if (error) throw new Error(error.message);
}

export async function setExclusivityStatus(
  db: LedgerDb,
  clientId: string,
  status: ExclusivityStatus
): Promise<void> {
  const { error } = await db
    .from("clients")
    .update({ exclusivity_status: status })
    .eq("id", clientId);
  if (error) throw new Error(error.message);
}

export async function listMapTerritories(): Promise<
  (Territory & {
    client: Pick<Client, "id" | "name" | "status"> | null;
    categories: { id: string; name: string; slug: string }[];
  })[]
> {
  const peers = await listActiveExclusivityPeers();
  const categories = await listServiceCategories({ activeOnly: true });
  const byId = new Map(categories.map((category) => [category.id, category]));

  return peers.flatMap((peer) =>
    peer.territories.map((territory) => ({
      ...territory,
      client: peer.client,
      categories: peer.categoryIds
        .map((id) => byId.get(id))
        .filter((row): row is ServiceCategory => Boolean(row))
        .map((row) => ({ id: row.id, name: row.name, slug: row.slug })),
    }))
  );
}

export async function listOpenCrossClientMatches(): Promise<
  (CrossClientMatch & {
    lead_a: Pick<LeadLite, "id" | "arrived_at" | "name"> | null;
    lead_b: Pick<LeadLite, "id" | "arrived_at" | "name"> | null;
    client_a: { id: string; name: string } | null;
    client_b: { id: string; name: string } | null;
  })[]
> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("cross_client_matches")
    .select(
      "*, lead_a:leads!cross_client_matches_lead_a_id_fkey(id, arrived_at, name), lead_b:leads!cross_client_matches_lead_b_id_fkey(id, arrived_at, name), client_a:clients!cross_client_matches_client_a_id_fkey(id, name), client_b:clients!cross_client_matches_client_b_id_fkey(id, name)"
    )
    .is("acknowledged_at", null)
    .order("created_at", { ascending: true })
    .limit(200)
    .returns<
      (CrossClientMatch & {
        lead_a: Pick<LeadLite, "id" | "arrived_at" | "name"> | null;
        lead_b: Pick<LeadLite, "id" | "arrived_at" | "name"> | null;
        client_a: { id: string; name: string } | null;
        client_b: { id: string; name: string } | null;
      })[]
    >();

  if (error) throw new Error(error.message);
  return data ?? [];
}

type LeadLite = { id: string; arrived_at: string; name: string | null };
