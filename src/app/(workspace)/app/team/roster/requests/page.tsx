import Link from "next/link";

import { RequestQueue } from "@/app/(workspace)/app/team/roster/requests/queue-table";
import { saveRequestViewForm } from "@/app/(workspace)/app/team/roster/requests/actions";
import { PageFrame } from "@/components/app/page-frame";
import { RosterTabs } from "@/components/staff/roster-tabs";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/auth/gates";
import { requireAccessRequests } from "@/lib/access-requests/access";
import { businessDaysSince } from "@/lib/access-requests/business-days";
import { formatRelative } from "@/lib/format";
import { staffDb } from "@/lib/staff/db";
import { helperClass, selectClass } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Access requests" };

const KINDS: Record<string, string> = { private_access: "Private Access", custom: "Custom" };
const STATUSES = ["new", "in_review", "approved", "waitlisted", "declined", "converted", "archived"];

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function daysAgo(days: number): string {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff.toISOString().slice(0, 10);
}

export default async function AccessRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireStaff();
  const level = await requireAccessRequests(ctx);
  const params = await searchParams;
  const q = one(params.q).trim();
  const status = one(params.status);
  const kind = one(params.kind);
  const sort = one(params.sort) === "oldest" ? "oldest" : "newest";
  const db = await staffDb();
  let query = db
    .from("access_requests")
    .select("id, kind, full_name, business_name, business_type, team_size, crm, leads_per_month, status, created_at, last_activity_at, owner_user_id")
    .limit(200);
  if (status && STATUSES.includes(status)) query = query.eq("status", status);
  if (kind === "private_access" || kind === "custom") query = query.eq("kind", kind);
  const safeQuery = q.replace(/[^a-zA-Z0-9 @.&'-]/g, "").slice(0, 80);
  if (safeQuery) query = query.or(`full_name.ilike.%${safeQuery}%,business_name.ilike.%${safeQuery}%`);
  query = query.order(sort === "oldest" ? "created_at" : "last_activity_at", { ascending: sort === "oldest" });

  const [{ data: rows }, { data: settings }, { data: staff }, { data: views }, { data: metrics }, { data: onboarding }] = await Promise.all([
    query,
    db.from("access_request_settings").select("onboard_intent, stale_business_days, staff_timezone").eq("id", 1).maybeSingle(),
    db.from("platform_staff").select("user_id, display_name").eq("active", true),
    db.from("access_request_views").select("id, name, query").eq("user_id", ctx.user.id),
    level === "admin"
      ? db.from("public_site_daily").select("event_type, count").gte("day", daysAgo(30))
      : Promise.resolve({ data: [] as Array<{ event_type: string; count: number }> }),
    db.from("organizations").select("id, status"),
  ]);

  const names = new Map((staff ?? []).map((person) => [person.user_id as string, person.display_name as string]));
  const now = new Date();
  const staleDays = Number(settings?.stale_business_days ?? 2);
  const zone = String(settings?.staff_timezone ?? "America/New_York");
  const list = (rows ?? []).map((row) => ({
    id: String(row.id),
    kind: KINDS[String(row.kind)] ?? String(row.kind),
    name: String(row.full_name),
    business: String(row.business_name),
    industry: String(row.business_type ?? "Not given"),
    team: String(row.team_size ?? "Not given"),
    crm: String(row.crm ?? "Not given"),
    leads: String(row.leads_per_month ?? "Not given"),
    status: String(row.status).replaceAll("_", " "),
    age: `${businessDaysSince(String(row.created_at), now, zone)} business days`,
    owner: row.owner_user_id ? names.get(String(row.owner_user_id)) ?? "Assigned" : "Unassigned",
    activity: formatRelative(String(row.last_activity_at), now.toISOString()),
    stale: ["new", "in_review"].includes(String(row.status)) && businessDaysSince(String(row.created_at), now, zone) >= staleDays,
  }));
  const counts = (metrics ?? []).reduce<Record<string, number>>((sum, row) => {
    const key = String(row.event_type);
    sum[key] = (sum[key] ?? 0) + Number(row.count);
    return sum;
  }, {});
  const onboarded = (onboarding ?? []).filter((row) => row.status === "onboarding").length;
  const queryString = new URLSearchParams(
    Object.entries({ q, status, kind, sort }).filter((entry) => entry[1])
  ).toString();

  return (
    <PageFrame title="Access requests" description="Private Access and Custom requests. They are not inside a customer workspace.">
      <RosterTabs current="requests" showRequests />
      <form className="mb-4 flex flex-wrap gap-2" action="/app/team/roster/requests">
        <input name="q" defaultValue={q} placeholder="Search name or business" aria-label="Search" className="h-10 rounded-xl border border-white/10 bg-transparent px-3 text-sm" />
        <select name="status" defaultValue={status} aria-label="Status" className={selectClass}>
          <option value="">Any status</option>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select name="kind" defaultValue={kind} aria-label="Type" className={selectClass}>
          <option value="">Any type</option>
          <option value="private_access">Private Access</option>
          <option value="custom">Custom</option>
        </select>
        <select name="sort" defaultValue={sort} aria-label="Sort" className={selectClass}>
          <option value="newest">Newest activity</option>
          <option value="oldest">Oldest</option>
        </select>
        <Button type="submit" size="sm" variant="secondary">Filter</Button>
      </form>
      <div className="mb-4 flex flex-wrap gap-3 text-sm text-silver">
        {(views ?? []).map((view) => {
          const saved = (view.query as { q?: string } | null)?.q ?? "";
          return (
            <Link key={String(view.id)} href={`/app/team/roster/requests?${saved}`} className="underline">
              {String(view.name)}
            </Link>
          );
        })}
        <form action={saveRequestViewForm}>
          <input type="hidden" name="query" value={queryString} />
          <input name="name" aria-label="View name" placeholder="Save this view" className="h-8 rounded-lg border border-white/10 bg-transparent px-2 text-sm" maxLength={80} />
        </form>
      </div>
      <p className={`${helperClass} mb-4`}>
        Planning aid: intend to onboard {settings?.onboard_intent ?? 0} at a time. {onboarded} workspaces are in onboarding now. This does not block a request.
      </p>
      {level === "admin" ? (
        <p className={`${helperClass} mb-4`}>
          Last 30 days, no personal data: {counts.page_view ?? 0} page views, {counts.cta_click ?? 0} button clicks, {counts.form_start ?? 0} forms started, {counts.form_complete ?? 0} forms submitted.
          {" "}
          <Link href="/app/team/roster/requests/export" className="underline">Export</Link>
          {" · "}
          <Link href="/app/team/roster/requests/settings" className="underline">Settings</Link>
        </p>
      ) : null}
      <RequestQueue rows={list} admin={level === "admin"} />
    </PageFrame>
  );
}
