import { notFound } from "next/navigation";

import { saveRequestSettings, saveRequestTemplate, setRequestViewer } from "@/app/(workspace)/app/team/roster/requests/actions";
import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/auth/gates";
import { staffDb } from "@/lib/staff/db";
import { helperClass, textareaClass } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Access request settings" };

export default async function AccessRequestSettingsPage() {
  const ctx = await requireStaff();
  if (!ctx.isPlatformAdmin) notFound();
  const db = await staffDb();
  const [{ data: settings }, { data: templates }, { data: staff }] = await Promise.all([
    db.from("access_request_settings").select("*").eq("id", 1).maybeSingle(),
    db.from("access_request_templates").select("id, label, subject, body"),
    db.from("platform_staff").select("user_id, display_name, can_view_access_requests").eq("role", "service_team").eq("active", true),
  ]);

  return (
    <PageFrame title="Request settings" description="Capacity is a planning aid. It does not block a request. Fit rules are the sentences shown on each request.">
      <form action={async (formData) => { "use server"; await saveRequestSettings(formData); }} className="grid max-w-xl gap-3">
        <label className="text-sm text-strong">
          Teams to onboard at a time
          <input name="onboard_intent" type="number" min={0} max={500} defaultValue={Number(settings?.onboard_intent ?? 5)} className="mt-1 h-10 w-full rounded-xl border border-overlay/10 bg-transparent px-3" />
        </label>
        <label className="text-sm text-strong">
          Keep declined or inactive requests (months)
          <input name="retention_months" type="number" min={1} max={84} defaultValue={Number(settings?.retention_months ?? 12)} className="mt-1 h-10 w-full rounded-xl border border-overlay/10 bg-transparent px-3" />
        </label>
        <label className="text-sm text-strong">
          Flag after this many business days
          <input name="stale_business_days" type="number" min={1} max={30} defaultValue={Number(settings?.stale_business_days ?? 2)} className="mt-1 h-10 w-full rounded-xl border border-overlay/10 bg-transparent px-3" />
        </label>
        <label className="text-sm text-strong">
          Time zone for that count
          <input name="staff_timezone" defaultValue={String(settings?.staff_timezone ?? "America/New_York")} className="mt-1 h-10 w-full rounded-xl border border-overlay/10 bg-transparent px-3" />
        </label>
        <label className="text-sm text-strong">
          Fit rules
          <textarea name="fit_rules" className={textareaClass} defaultValue={JSON.stringify(settings?.fit_rules ?? [], null, 2)} />
        </label>
        <Button type="submit" size="sm">Save settings</Button>
        <p className={helperClass}>Keep 12 months as the request retention default. The 2 business day stale flag is an internal staff reminder only. It is not shown or promised to visitors.</p>
      </form>
      <section className="mt-10 space-y-6">
        <h2 className="font-heading text-lg text-strong">Reply templates</h2>
        {(templates ?? []).map((template) => (
          <form key={String(template.id)} action={async (formData) => { "use server"; await saveRequestTemplate(String(template.id), String(formData.get("subject") ?? ""), String(formData.get("body") ?? "")); }} className="grid max-w-xl gap-2">
            <p className="text-sm text-strong">{String(template.label)}</p>
            <input name="subject" defaultValue={String(template.subject)} aria-label={`${template.label} subject`} className="h-10 rounded-xl border border-overlay/10 bg-transparent px-3 text-sm" />
            <textarea name="body" defaultValue={String(template.body)} aria-label={`${template.label} body`} className={textareaClass} />
            <Button type="submit" size="sm" variant="secondary">Save template</Button>
          </form>
        ))}
        <p className={helperClass}>A template may include {"{{name}}"} and nothing else the visitor typed.</p>
      </section>
      <section className="mt-10">
        <h2 className="font-heading text-lg text-strong">Service Team view</h2>
        <ul className="mt-3 space-y-2">
          {(staff ?? []).map((person) => (
            <li key={String(person.user_id)}>
              <form action={async () => { "use server"; await setRequestViewer(String(person.user_id), !person.can_view_access_requests); }}>
                <Button type="submit" size="sm" variant="secondary">
                  {person.can_view_access_requests ? `Remove view for ${person.display_name}` : `Let ${person.display_name} view requests`}
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <p className={helperClass}>View does not include export or deletion.</p>
      </section>
    </PageFrame>
  );
}
