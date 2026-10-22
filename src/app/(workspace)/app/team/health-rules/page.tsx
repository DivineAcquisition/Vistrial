import { HealthRulesForm } from "@/app/(workspace)/app/team/health-rules/form";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { formatDateTime } from "@/lib/format";
import { loadHealthRuleHistory } from "@/lib/staff/load";
import { helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Health rules" };

export default async function HealthRulesPage() {
  await requirePlatformAdmin();
  const history = await loadHealthRuleHistory();
  const current = history[0];
  if (!current) return null;
  return (
    <PageFrame title="Health rules" description="Each save is a new version. Say what changed, in a sentence. The check must be recent.">
      <HealthRulesForm rules={current.rules} />
      <Panel className="p-6">
        <h2 className="font-heading text-sm text-card-foreground">Versions</h2>
        <ul className="mt-3 divide-y divide-overlay/[0.06]">
          {history.map((row) => (
            <li key={row.version} className="py-3">
              <p className="text-sm text-strong">
                Version {row.version}: {row.description}
              </p>
              <p className={helperClass}>
                {row.created_by_name ?? "Vistrial"} · {formatDateTime(row.created_at)}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    </PageFrame>
  );
}
