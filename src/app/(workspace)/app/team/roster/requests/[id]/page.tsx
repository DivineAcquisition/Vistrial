import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addRequestNote,
  assignRequest,
  deleteRequest,
  sendRequestReply,
  setRequestStatus,
} from "@/app/(workspace)/app/team/roster/requests/actions";
import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/auth/gates";
import { requireAccessRequests } from "@/lib/access-requests/access";
import { DEFAULT_FIT_RULES, fitLines, parseFitRules } from "@/lib/access-requests/fit";
import { staffDb } from "@/lib/staff/db";
import { helperClass, selectClass, textareaClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

const STATUSES = ["new", "in_review", "waiting", "answered", "closed", "approved", "waitlisted", "declined", "archived"];

export default async function AccessRequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const level = await requireAccessRequests(ctx);
  const { id } = await params;
  const db = await staffDb();
  const [{ data: row }, { data: events }, { data: settings }, { data: staff }, { data: templates }] = await Promise.all([
    db.from("access_requests").select("*").eq("id", id).maybeSingle(),
    db.from("access_request_events").select("id, at, kind, from_status, to_status, detail, actor_id").eq("request_id", id).order("at", { ascending: false }).limit(40),
    db.from("access_request_settings").select("fit_rules").eq("id", 1).maybeSingle(),
    db.from("platform_staff").select("user_id, display_name").eq("active", true),
    db.from("access_request_templates").select("id, label"),
  ]);
  if (!row) notFound();
  await db.rpc("log_access_request_view", { p_id: id });
  const rules = parseFitRules(settings?.fit_rules) ?? DEFAULT_FIT_RULES;
  const lines = fitLines(
    {
      business_type: row.business_type as string | null,
      crm: row.crm as string | null,
      deal_value: row.deal_value as string | null,
      calls_per_week: row.calls_per_week as string | null,
    },
    rules
  );
  const admin = level === "admin";
  const fields: Array<[string, unknown]> = [
    ["Type", row.kind],
    ["Role", row.request_role],
    ["Needs", Array.isArray(row.review_needs) ? row.review_needs.join(", ") : ""],
    ["Deadline", row.deadline],
    ["Priority", row.priority],
    ["Existing customer", row.existing_customer ? "Yes" : ""],
    ["Name", row.full_name],
    ["Email", row.email],
    ["Business", row.business_name],
    ["Website", row.website],
    ["Industry", row.business_type],
    ["Industry detail", row.business_type_other],
    ["Team", row.team_size],
    ["Lead data", Array.isArray(row.lead_sources) ? row.lead_sources.join(", ") : ""],
    ["CRM", row.crm],
    ["CRM detail", row.crm_other],
    ["Deal value", row.deal_value],
    ["Calls per week", row.calls_per_week],
    ["Leads per month", row.leads_per_month],
    ["Problem", row.problem],
    ["Need", row.need],
    ["Phone", row.phone],
    ["Heard about", row.heard_about],
    ["Page", row.page_path],
    ["Existing account", row.existing_account ? "Yes, internally" : "No"],
    ["Workspace", row.converted_org_id],
  ];

  return (
    <PageFrame title={String(row.business_name)} description="Submitted answers, history, and the fit summary from the visible rules.">
      <p className="mb-4 text-sm">
        <Link href="/app/team/roster/requests" className="text-brand-300 underline">Back to requests</Link>
      </p>
      <section className="rounded-2xl border border-white/10 p-4">
        <h2 className="font-heading text-lg text-white">Fit summary</h2>
        <ul className="mt-2 space-y-1 text-sm text-silver">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm text-white">{value ? String(value) : "Not given"}</dd>
          </div>
        ))}
      </dl>
      {admin && row.kind === "private_access" && row.status !== "converted" ? (
        <p className="mt-6">
          <Link
            href={`/app/team/roster?request=${row.id}#new-workspace`}
            className="text-sm font-medium text-brand-300 underline"
          >
            Start onboarding
          </Link>
          <span className={`block ${helperClass}`}>Opens the workspace form with this request filled in. Nothing is billed.</span>
        </p>
      ) : null}
      {row.converted_org_id ? (
        <p className="mt-4 text-sm">
          <Link href={`/app/team/workspaces/${row.converted_org_id}`} className="text-brand-300 underline">Open the workspace</Link>
        </p>
      ) : null}
      {admin ? (
        <div className="mt-8 grid gap-6">
          <form action={async (formData) => {
            "use server";
            await setRequestStatus(id, String(formData.get("status")), Number(row.version));
          }} className="flex flex-wrap items-center gap-2">
            <select name="status" defaultValue={String(row.status)} aria-label="Status" className={selectClass}>
              {STATUSES.map((item) => (
                <option key={item} value={item}>{item.replaceAll("_", " ")}</option>
              ))}
            </select>
            <Button type="submit" size="sm">Save status</Button>
          </form>
          <form action={async (formData) => {
            "use server";
            await assignRequest(id, String(formData.get("owner") ?? ""), Number(row.version));
          }} className="flex flex-wrap items-center gap-2">
            <select name="owner" defaultValue={String(row.owner_user_id ?? "")} aria-label="Owner" className={selectClass}>
              <option value="">Unassigned</option>
              {(staff ?? []).map((person) => (
                <option key={String(person.user_id)} value={String(person.user_id)}>{String(person.display_name)}</option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="secondary">Assign</Button>
          </form>
          <form action={async (formData) => {
            "use server";
            await addRequestNote(id, String(formData.get("note") ?? ""));
          }}>
            <label htmlFor="note" className="text-sm text-white">Internal note</label>
            <textarea id="note" name="note" className={textareaClass} maxLength={2000} />
            <Button type="submit" size="sm" className="mt-2">Add note</Button>
          </form>
          <form action={async (formData) => {
            "use server";
            await sendRequestReply(id, String(formData.get("template") ?? ""));
          }} className="flex flex-wrap items-center gap-2">
            <select name="template" aria-label="Reply template" className={selectClass} defaultValue="">
              <option value="">Choose a template</option>
              {(templates ?? []).map((template) => (
                <option key={String(template.id)} value={String(template.id)}>{String(template.label)}</option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="secondary">Send reply</Button>
          </form>
          <form action={async (formData) => {
            "use server";
            await deleteRequest(id, String(formData.get("reason") ?? ""));
          }}>
            <label htmlFor="reason" className="text-sm text-white">Delete this request</label>
            <input id="reason" name="reason" className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-transparent px-3 text-sm" placeholder="Why it is being deleted" />
            <Button type="submit" size="sm" variant="destructive" className="mt-2">Delete</Button>
          </form>
        </div>
      ) : (
        <p className={`${helperClass} mt-6`}>You can read this request. A Platform Admin changes it.</p>
      )}
      <section className="mt-10">
        <h2 className="font-heading text-lg text-white">History</h2>
        <ul className="mt-3 space-y-2 text-sm text-silver">
          {(events ?? []).map((event) => (
            <li key={String(event.id)}>
              {String(event.at)} · {String(event.kind)}
              {event.to_status ? ` · ${String(event.to_status)}` : ""}
              {event.detail && typeof event.detail === "object" && "note" in (event.detail as object)
                ? ` · ${String((event.detail as { note?: string }).note)}`
                : ""}
            </li>
          ))}
        </ul>
      </section>
    </PageFrame>
  );
}
