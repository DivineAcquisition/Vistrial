import Link from "next/link";

import { notifyInterest, submitToolRequest } from "@/app/(workspace)/app/settings/connections/actions";
import { PageFrame } from "@/components/app/page-frame";
import { ToolMark } from "@/components/connectors/tool-mark";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { CONNECTOR_CATEGORIES, CONNECTORS, PLAN_LIMIT_LINE, connectorByKey } from "@/lib/connectors/catalog";
import { managesConnections, requireConnectionViewer } from "@/lib/connectors/gate";
import { holdBanner } from "@/lib/connectors/status";
import { statusView } from "@/lib/connectors/status";
import { connectorEnabled, connectorEntitlement, listConnections, unhealthyTools } from "@/lib/connectors/store";
import { vendorConfigured } from "@/lib/connectors/vendors";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connections" };

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireConnectionViewer();
  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();
  const canManage = managesConnections(ctx);
  const [rows, plan, unhealthy] = await Promise.all([
    listConnections(ctx.org.id),
    connectorEntitlement(ctx.org.id),
    unhealthyTools(ctx.org.id),
  ]);
  const banner = holdBanner(unhealthy);
  const connected = rows.filter((row) => row.status !== "disconnected");
  const enabled = await Promise.all(CONNECTORS.map(async (connector) => ({
    connector,
    on: connector.availability === "connect" ? await connectorEnabled(ctx.org.id, connector.key) : false,
  })));
  const visible = enabled.filter(({ connector }) => {
    if (!query) return true;
    return `${connector.name} ${connector.summary}`.toLowerCase().includes(query);
  });

  return (
    <PageFrame
      title="Connections"
      description="Where this workspace reads sales data from. Each tool stays the record for its own data. Vistrial does not change a tool unless you turn sending on."
    >
      {banner ? <Notice tone="warning" title="Some data may be out of date">{banner}</Notice> : null}
      <p className={helperClass}>
        Never send a password or an API key to the Vistrial team. If someone asks you for one, do not share it.
      </p>

      <Panel className="p-6">
        <h2 className={cardTitle}>Connected</h2>
        {connected.length === 0 ? (
          <p className={`${helperClass} mt-2`}>Nothing is connected yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/10">
            {connected.map((row) => {
              const tool = connectorByKey(row.connector_key);
              const view = statusView({
                state: row.status as "live",
                tool: tool?.name ?? row.connector_key,
                detail: row.status_detail,
                testMode: row.test_mode,
                testModeNote: tool?.testModeNote,
              });
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <ToolMark id={row.connector_key} />
                    <span>
                      <span className="block text-sm text-white">{tool?.name ?? row.connector_key}</span>
                      <span className={helperClass}>{row.external_account_label ?? view.sentence}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusBadge label={view.label} tone={view.tone} />
                    <Link href={`/app/settings/connections/view/${row.id}`} className="text-sm text-brand-300 underline">
                      {view.action ?? "View details"}
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <form className="mt-6" action="/app/settings/connections">
        <label className="block text-sm text-white" htmlFor="q">
          Search tools
        </label>
        <input
          id="q"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search"
          className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </form>

      <div className="mt-6 space-y-8">
        <h2 className={cardTitle}>Add a source</h2>
        {CONNECTOR_CATEGORIES.map((category) => {
          const tools = visible.filter(({ connector }) => connector.category === category.id);
          if (tools.length === 0) return null;
          return (
            <section key={category.id}>
              <h3 className="text-sm font-medium text-white">{category.label}</h3>
              <ul className="mt-3 grid gap-3">
                {tools.map(({ connector, on }) => {
                  const blocked = connector.countsTowardLimit && !plan.allowed && connector.availability === "connect";
                  return (
                    <li key={connector.key}>
                      <Panel className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <ToolMark id={connector.key} />
                            <div>
                            <p className="text-sm text-white">{connector.name}</p>
                            <p className={`${helperClass} mt-1`}>{connector.summary}</p>
                            <p className={`${helperClass} mt-1`}>{connector.methodLabel}</p>
                            {connector.beta ? <p className={helperClass}>Beta</p> : null}
                            {connector.testModeNote && on ? <p className={`${helperClass} mt-2`}>{connector.testModeNote}</p> : null}
                            </div>
                          </div>
                          <TileAction
                            connectorKey={connector.key}
                            availability={connector.availability}
                            enabled={on}
                            configured={connector.method !== "oauth" || vendorConfigured(connector.key) || connector.key === "gohighlevel"}
                            blocked={blocked}
                            limit={plan.limit}
                            canManage={canManage}
                            isStaff={ctx.isStaff}
                          />
                        </div>
                      </Panel>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <Panel className="mt-8 p-6">
        <h2 className={cardTitle}>Do not see your tool?</h2>
        <p className={`${helperClass} mt-2`}>
          You can send data from almost any tool using a webhook or an automation tool, or upload a spreadsheet.
        </p>
        {canManage ? (
          <form action={submitToolRequest} className="mt-4 grid gap-3">
            <label className="text-sm text-white" htmlFor="tool_name">Tool name</label>
            <input id="tool_name" name="tool_name" required className="rounded-md border bg-background px-3 py-2 text-sm" />
            <label className="text-sm text-white" htmlFor="wanted">What data do you want from it?</label>
            <textarea id="wanted" name="wanted" required className="rounded-md border bg-background px-3 py-2 text-sm" rows={3} />
            <label className="text-sm text-white" htmlFor="urgency">How urgent?</label>
            <select id="urgency" name="urgency" className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="now">Need it now</option>
              <option value="soon">Soon</option>
              <option value="later">Later</option>
            </select>
            <Button type="submit">Send request</Button>
          </form>
        ) : (
          <p className={`${helperClass} mt-2`}>Ask an Owner to request a tool.</p>
        )}
      </Panel>
    </PageFrame>
  );
}

function TileAction({
  connectorKey,
  availability,
  enabled,
  configured,
  blocked,
  limit,
  canManage,
  isStaff,
}: {
  connectorKey: string;
  availability: "connect" | "coming_soon" | "notify";
  enabled: boolean;
  configured: boolean;
  blocked: boolean;
  limit: number | null;
  canManage: boolean;
  isStaff: boolean;
}) {
  if (availability === "notify") {
    return (
      <form action={notifyInterest.bind(null, connectorKey)}>
        <Button type="submit" variant="secondary">Notify me</Button>
      </form>
    );
  }
  if (availability === "coming_soon" || !enabled) {
    return <StatusBadge label="Coming soon" tone="neutral" />;
  }
  if (blocked && limit) {
    return (
      <div>
        <p className={helperClass}>{PLAN_LIMIT_LINE(limit)}</p>
        <Link href="/app/settings/billing" className="text-sm text-brand-300 underline">Upgrade</Link>
        {isStaff ? <p className={helperClass}>Or contact your team.</p> : null}
      </div>
    );
  }
  if (!canManage) {
    return <Link href={`/app/settings/connections/${connectorKey}`} className="text-sm text-brand-300 underline">View</Link>;
  }
  if (!configured) {
    return <p className={helperClass}>Not configured on this site yet.</p>;
  }
  return (
    <Link href={`/app/settings/connections/${connectorKey}`} className="text-sm font-medium text-brand-300 underline">
      Connect
    </Link>
  );
}
