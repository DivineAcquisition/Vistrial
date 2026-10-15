import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { requireStaff } from "@/lib/auth/gates";
import { staffDb } from "@/lib/staff/db";
import { requestAgeDays, requestNeedsAttention } from "@/lib/trust/request-age";
import { helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trust settings" };

const SWITCHES: Array<{ field: string; label: string; check: string }> = [
  {
    field: "switch_ai_no_training",
    label: "AI provider does not train on customer data",
    check: "Confirm in the Anthropic console that this workspace's API use is not used for model training. Leave this off until you have checked that page.",
  },
  {
    field: "switch_encryption_at_rest",
    label: "Data encrypted at rest",
    check: "Confirm in the Supabase project settings that disk encryption is on. Leave this off until you have checked that page.",
  },
  {
    field: "switch_backups",
    label: "Backups taken and restore tested",
    check: "Confirm in the Supabase backups page that backups exist and that a restore has been tested. Leave this off until you have checked that page.",
  },
  {
    field: "switch_no_sell",
    label: "We do not sell your data",
    check: "Turn this on only after qualified counsel approves that sentence.",
  },
  {
    field: "switch_staff_mfa",
    label: "Multi-factor sign-in required for staff",
    check: "Confirm in the live Supabase Auth settings that staff multi-factor is required, not only coded. Leave this off until you have checked production.",
  },
];

async function saveSetting(formData: FormData) {
  "use server";
  const { staffDb: dbClient } = await import("@/lib/staff/db");
  const db = await dbClient();
  await db.rpc("update_public_site_setting", {
    p_field: String(formData.get("field") ?? ""),
    p_value: String(formData.get("value") ?? ""),
    p_bump_date: formData.get("bump") === "yes",
  });
}

export default async function TrustSettingsPage() {
  const ctx = await requireStaff();
  if (!ctx.isPlatformAdmin) notFound();
  const db = await staffDb();
  const [{ data: settings }, { data: rows }, { data: docs }, { data: dataRequests }] = await Promise.all([
    db.from("public_site_settings").select("*").eq("id", 1).maybeSingle(),
    db.from("subprocessors").select("id, company, purpose, data_handled, location, published").order("sort_order"),
    db.from("security_documents").select("id, title, version, created_at").order("created_at", { ascending: false }),
    db.from("trust_data_requests").select("id, reference, kind, status, requester_email, created_at").order("created_at", { ascending: false }).limit(50),
  ]);
  const setting = (settings ?? {}) as Record<string, unknown>;

  return (
    <PageFrame title="Trust settings" description="Public claim switches default to off. The internal mailbox is never shown on the site.">
      <p className="mb-4 text-sm">
        <Link href="/app/team/roster/requests" className="text-brand-300 underline">Back to requests</Link>
      </p>
      <p className={helperClass}>
        The privacy draft is readable at /privacy, with a draft banner, until the mailing address is saved and privacy is approved. It stays out of search results until then. Vulnerability safe harbor text stays off the report page until you approve it.
      </p>
      <form action={saveSetting} className="mt-6 grid max-w-xl gap-3">
        <input type="hidden" name="field" value="legal_entity_name" />
        <label className="text-sm text-white">Legal entity name
          <input name="value" defaultValue={String(setting.legal_entity_name ?? "")} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-transparent px-3" />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="bump" value="yes" /> Update the privacy and terms dates</label>
        <button type="submit" className="text-sm text-brand-300 underline w-fit">Save entity</button>
      </form>
      <form action={saveSetting} className="mt-4 grid max-w-xl gap-3">
        <input type="hidden" name="field" value="mailing_address" />
        <label className="text-sm text-white">Mailing address
          <input name="value" defaultValue={String(setting.mailing_address ?? "")} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-transparent px-3" />
        </label>
        <button type="submit" className="text-sm text-brand-300 underline w-fit">Save address</button>
      </form>
      <form action={saveSetting} className="mt-4 grid max-w-xl gap-3">
        <input type="hidden" name="field" value="internal_forward_email" />
        <label className="text-sm text-white">Internal forwarding address (never public)
          <input name="value" defaultValue={String(setting.internal_forward_email ?? "")} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-transparent px-3" />
        </label>
        <button type="submit" className="text-sm text-brand-300 underline w-fit">Save internal address</button>
      </form>
      <section className="mt-8 space-y-4">
        <h2 className="font-heading text-lg text-white">Claim switches</h2>
        {SWITCHES.map((item) => (
          <form key={item.field} action={saveSetting} className="max-w-xl rounded-2xl border border-white/10 p-4">
            <input type="hidden" name="field" value={item.field} />
            <p className="text-sm text-white">{item.label}</p>
            <p className={`mt-1 ${helperClass}`}>{item.check}</p>
            <input type="hidden" name="value" value={setting[item.field] === true ? "false" : "true"} />
            <button type="submit" className="mt-2 text-sm text-brand-300 underline">
              {setting[item.field] === true ? "Turn off" : "Turn on"}
            </button>
          </form>
        ))}
        {(["privacy_approved", "terms_approved", "vulnerability_safe_harbor_approved"] as const).map((field) => (
          <form key={field} action={saveSetting}>
            <input type="hidden" name="field" value={field} />
            <input type="hidden" name="value" value={setting[field] === true ? "false" : "true"} />
            <button type="submit" className="text-sm text-brand-300 underline">
              {setting[field] === true ? `Revoke ${field}` : `Approve ${field}`}
            </button>
          </form>
        ))}
      </section>
      <section className="mt-8">
        <h2 className="font-heading text-lg text-white">Privacy data requests</h2>
        <p className={helperClass}>Open requests older than 30 days are marked so the queue can meet the response aim in the privacy policy.</p>
        <ul className="mt-3 space-y-2 text-sm text-silver">
          {(dataRequests ?? []).map((row) => {
            const created = String(row.created_at ?? "");
            const status = String(row.status ?? "");
            const late = created ? requestNeedsAttention(status, created) : false;
            return (
              <li key={String(row.id)}>
                {String(row.reference)} · {String(row.kind)} · {status}
                {row.requester_email ? ` · ${String(row.requester_email)}` : ""}
                {created ? ` · ${requestAgeDays(created)} days old` : ""}
                {late ? " · older than 30 days" : ""}
              </li>
            );
          })}
        </ul>
        {(dataRequests ?? []).length === 0 ? <p className={helperClass}>No privacy data requests.</p> : null}
      </section>
      <section className="mt-8">
        <h2 className="font-heading text-lg text-white">Subprocessors</h2>
        <p className={helperClass}>A row is public only when it is published and has a location. Adding one does not email customers until you send a notice on purpose.</p>
        <ul className="mt-3 space-y-2 text-sm text-silver">
          {(rows ?? []).map((row) => (
            <li key={String(row.id)}>{String(row.company)}: {row.published ? "published" : "hidden"}{row.location ? ` · ${row.location}` : " · location not confirmed"}</li>
          ))}
        </ul>
      </section>
      <section className="mt-8">
        <h2 className="font-heading text-lg text-white">Security documents</h2>
        <p className={helperClass}>Empty until you add one. Nothing here is public.</p>
        <ul className="mt-3 text-sm text-silver">
          {(docs ?? []).map((doc) => (
            <li key={String(doc.id)}>{String(doc.title)} · version {String(doc.version)}</li>
          ))}
        </ul>
      </section>
    </PageFrame>
  );
}
