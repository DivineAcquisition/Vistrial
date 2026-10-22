import { enableConnector, shareAccount } from "@/app/(workspace)/app/settings/connections/actions";
import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { CONNECTORS } from "@/lib/connectors/catalog";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connector access" };

export default async function TeamConnectorsPage() {
  await requirePlatformAdmin();
  return (
    <PageFrame
      title="Connector access"
      description="Turn a connector on for one workspace, or allow one external account to be used by two workspaces. Tokens are not shown here."
    >
      <Panel className="p-6">
        <h2 className={cardTitle}>Enable for a workspace</h2>
        <form action={enableConnector} className="mt-4 grid gap-3">
          <label className="text-sm text-strong" htmlFor="org_id">Workspace id</label>
          <input id="org_id" name="org_id" required className="rounded-md border bg-background px-3 py-2 text-sm" />
          <label className="text-sm text-strong" htmlFor="connector">Connector</label>
          <select id="connector" name="connector" className="rounded-md border bg-background px-3 py-2 text-sm">
            {CONNECTORS.filter((row) => row.availability === "connect").map((row) => (
              <option key={row.key} value={row.key}>{row.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-strong">
            <input type="checkbox" name="enabled" defaultChecked />
            Enabled
          </label>
          <Button type="submit">Save</Button>
        </form>
      </Panel>
      <Panel className="p-6">
        <h2 className={cardTitle}>Allow one account on two workspaces</h2>
        <p className={`${helperClass} mt-2`}>
          This is off unless you record a pair and a reason. The reason is kept in the audit trail.
        </p>
        <form action={shareAccount} className="mt-4 grid gap-3">
          <input name="connector" placeholder="Connector key" required className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input name="external" placeholder="External account id" required className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input name="org_id" placeholder="Workspace id" required className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input name="other_org_id" placeholder="Other workspace id" required className="rounded-md border bg-background px-3 py-2 text-sm" />
          <textarea name="reason" required minLength={8} placeholder="Why this pair may share the account" className="rounded-md border bg-background px-3 py-2 text-sm" />
          <Button type="submit">Record exception</Button>
        </form>
      </Panel>
    </PageFrame>
  );
}
