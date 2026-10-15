import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { MEANING_SEARCH_HOURLY_LIMIT } from "@/lib/billing/entitlements";
import { geminiApiKey, geminiEmbed, toVectorLiteral } from "@/lib/scribe/gemini";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Hit = { kind: string; id: string; title: string; detail: string; href: string };

export async function POST(request: Request) {
  const ctx = await getAuthContext();
  const body = (await request.json().catch(() => null)) as { q?: string; meaning?: boolean } | null;
  const q = body?.q?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] as Hit[], meaning: false });

  const db = (await createClient()) as unknown as SupabaseClient;
  const leads = await db.rpc("search_visible_leads", { p_org_id: ctx.org.id, p_query: q, p_limit: 8 });
  const tasks = await db.rpc("search_visible_tasks", { p_org_id: ctx.org.id, p_query: q, p_limit: 8 });
  const results: Hit[] = [
    ...((leads.data ?? []) as Array<{ id: string; title: string; detail: string }>).map((row) => ({
      kind: "leads",
      id: row.id,
      title: row.title || "Lead",
      detail: row.detail || "",
      href: `/app/cases/${row.id}`,
    })),
    ...((tasks.data ?? []) as Array<{ id: string; title: string; detail: string }>).map((row) => ({
      kind: "tasks",
      id: row.id,
      title: row.title,
      detail: row.detail || "",
      href: "/app/tasks",
    })),
  ];

  if (!body?.meaning) return NextResponse.json({ results, meaning: false });

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.org.id)
    .eq("user_id", ctx.user.id)
    .eq("kind", "meaning_search")
    .gte("occurred_at", since);
  if ((count ?? 0) >= MEANING_SEARCH_HOURLY_LIMIT) {
    return NextResponse.json({ results, meaning: false, limited: true });
  }
  if (!geminiApiKey()) return NextResponse.json({ results, meaning: false, unavailable: true });

  const [vector] = await geminiEmbed([q.slice(0, 500)], "RETRIEVAL_QUERY").catch(() => [[]]);
  if (!vector?.length) return NextResponse.json({ results, meaning: false, unavailable: true });
  const { data: matches } = await db.rpc("case_meaning_search", {
    p_org_id: ctx.org.id,
    p_embedding: toVectorLiteral(vector),
    p_limit: 8,
  });
  const ids = [...new Set(((matches ?? []) as Array<{ lead_id: string }>).map((row) => row.lead_id))];
  if (ids.length) {
    const { data: rows } = await db
      .from("leads")
      .select("id, first_name, last_name, status")
      .eq("org_id", ctx.org.id)
      .in("id", ids);
    for (const row of (rows ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; status: string }>) {
      if (results.some((hit) => hit.id === row.id)) continue;
      results.push({
        kind: "leads",
        id: row.id,
        title: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Lead",
        detail: `${row.status} · Search by meaning`,
        href: `/app/cases/${row.id}`,
      });
    }
  }
  await db.from("usage_events").insert({ org_id: ctx.org.id, user_id: ctx.user.id, kind: "meaning_search", quantity: 1 });
  return NextResponse.json({ results, meaning: true });
}
