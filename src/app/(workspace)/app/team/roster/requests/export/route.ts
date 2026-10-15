import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { staffDb } from "@/lib/staff/db";

export const dynamic = "force-dynamic";

function cell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return new NextResponse(null, { status: 404 });
  const db = await staffDb();
  const { data, error } = await db
    .from("access_requests")
    .select("kind, status, full_name, email, business_name, business_type, team_size, crm, leads_per_month, created_at, last_activity_at")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) return new NextResponse(null, { status: 404 });
  const rows = data ?? [];
  await db.rpc("log_access_request_export", { p_count: rows.length });
  const header = ["kind", "status", "full_name", "email", "business_name", "business_type", "team_size", "crm", "leads_per_month", "created_at", "last_activity_at"];
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => cell((row as Record<string, unknown>)[key])).join(","))].join("\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="access-requests.csv"',
    },
  });
}
