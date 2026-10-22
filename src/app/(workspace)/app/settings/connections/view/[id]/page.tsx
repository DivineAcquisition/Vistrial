import Link from "next/link";
import { cookies } from "next/headers";

import { disconnectAction, pauseAction, resumeAction, rotateSecretAction } from "@/app/(workspace)/app/settings/connections/actions";
import { PageFrame } from "@/components/app/page-frame";
import { ToolMark } from "@/components/connectors/tool-mark";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { connectorByKey } from "@/lib/connectors/catalog";
import { managesConnections, requireConnectionViewer } from "@/lib/connectors/gate";
import { loadConnection, readApiKey, recentDeliveries, stateHistory } from "@/lib/connectors/store";
import { statusView } from "@/lib/connectors/status";
import { cardTitle, helperClass } from "@/lib/ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ConnectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireConnectionViewer();
  const { id } = await params;
  const jar = await cookies();
  const once = jar.get("vistrial_hook_secret_once")?.value ?? null;
  if (once) jar.delete("vistrial_hook_secret_once");
  const row = await loadConnection(ctx.org.id, id);
  if (!row) notFound();
  const tool = connectorByKey(row.connector_key);
  const view = statusView({
    state: row.status as "live",
    tool: tool?.name ?? row.connector_key,
    detail: row.status_detail,
    testMode: row.test_mode,
    testModeNote: tool?.testModeNote,
  });
  const canManage = managesConnections(ctx);
  const [history, deliveries, key] = await Promise.all([
    stateHistory(row.id, ctx.org.id),
    recentDeliveries(row.id, ctx.org.id),
    readApiKey(row.id),
  ]);

  return (
    <PageFrame title={tool?.name ?? "Connection"} description={view.sentence}>
      <Panel className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-3">
            <ToolMark id={row.connector_key} size={36} />
            <StatusBadge label={view.label} tone={view.tone} />
          </span>
          <p className={helperClass}>{row.external_account_label ?? "No account name yet"}</p>
        </div>
        <dl className="mt-4 grid gap-2 text-sm">
          <div><dt className={helperClass}>Last update</dt><dd className="text-strong">{row.last_update_at ?? "None yet"}</dd></div>
          <div><dt className={helperClass}>Last full check</dt><dd className="text-strong">{row.last_full_check_at ?? "None yet"}</dd></div>
          <div><dt className={helperClass}>Permissions</dt><dd className="text-strong">{row.granted_scopes.join(", ") || "None recorded"}</dd></div>
          <div><dt className={helperClass}>Mapping version</dt><dd className="text-strong">{row.mapping_version}</dd></div>
          {key.last4 ? <div><dt className={helperClass}>Key</dt><dd className="text-strong">Ends in {key.last4}. Added {key.addedAt ?? "when it was saved"}.</dd></div> : null}
        </dl>
        {row.author_removed_at ? (
          <p className="mt-4 text-sm text-strong">Connected by someone who no longer has access. Reconnect to keep this under your control.</p>
        ) : null}
        {canManage ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {row.status === "paused" ? (
              <form action={resumeAction}><input type="hidden" name="connection" value={row.id} /><Button type="submit">Resume</Button></form>
            ) : row.status !== "disconnected" ? (
              <form action={pauseAction}><input type="hidden" name="connection" value={row.id} /><Button type="submit" variant="secondary">Pause</Button></form>
            ) : null}
            <Button variant="secondary" render={<Link href={`/app/settings/connections/${row.connector_key}/setup?connection=${row.id}`} />}>Edit setup</Button>
            {tool?.method === "oauth" ? (
              <Button variant="secondary" render={<a href={row.connector_key === "gohighlevel" ? "/api/leadconnector/oauth/start?from=connections" : `/api/connectors/oauth/start?connector=${row.connector_key}`} />}>Reconnect</Button>
            ) : null}
          </div>
        ) : null}
        {ctx.isStaff ? (
          <p className={`${helperClass} mt-4`}>
            <Link href="/app/settings/integrations/advanced" className="text-brand-300 underline">Review queues and replay</Link>
          </p>
        ) : null}
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Status, last 30 days</h2>
        <ul className="mt-3 space-y-2">
          {history.length === 0 ? <li className={helperClass}>No changes yet.</li> : null}
          {history.map((item) => (
            <li key={item.created_at} className="text-sm text-strong">
              {item.created_at.slice(0, 16).replace("T", " ")} · {item.status}
              {item.detail ? ` · ${item.detail}` : ""}
            </li>
          ))}
        </ul>
      </Panel>

      {deliveries.length ? (
        <Panel className="p-6">
          <h2 className={cardTitle}>Recent events</h2>
          <ul className="mt-3 space-y-2">
            {deliveries.map((item) => (
              <li key={item.received_at} className="text-sm text-strong">
                {item.received_at.slice(0, 16).replace("T", " ")} · {item.event_type ?? "event"} · {item.result}
                {item.reason ? ` · ${item.reason}` : ""}
                {item.ignored_fields?.length ? ` · ignored fields: ${item.ignored_fields.join(", ")}` : ""}
              </li>
            ))}
          </ul>
          {canManage && tool?.method === "webhook" ? (
            <form action={rotateSecretAction} className="mt-4">
              <input type="hidden" name="connection" value={row.id} />
              <Button type="submit" variant="secondary">Rotate secret</Button>
              {once ? <p className="mt-2 text-sm text-strong">New secret, shown once: {once}</p> : null}
            </form>
          ) : null}
        </Panel>
      ) : null}

      {canManage && row.status !== "disconnected" ? (
        <Panel className="p-6">
          <h2 className={cardTitle}>Disconnect</h2>
          <p className="mt-3 text-sm text-strong">
            {`Vistrial will stop receiving data from ${tool?.name ?? "this tool"}. Anything already in Vistrial stays until you ask us to delete it. Agents will stop using new data from ${tool?.name ?? "this tool"}.`}
          </p>
          <p className={`${helperClass} mt-2`}>
            Pausing stops reads and sends. Events that arrive while paused are dropped, and the gap is filled on resume. Anything older than the resume moment is treated as history.
          </p>
          <form action={disconnectAction} className="mt-4 grid gap-3">
            <input type="hidden" name="connection" value={row.id} />
            <label className="flex items-start gap-2 text-sm text-strong">
              <input type="checkbox" name="delete_data" />
              Also delete the data that came from {tool?.name ?? "this tool"}. This starts a request. It is not deleted instantly.
            </label>
            <Button type="submit" variant="secondary">Disconnect</Button>
          </form>
          <p className={`${helperClass} mt-3`}>
            If the tool does not let Vistrial revoke access, remove Vistrial from the tool's own app or integration settings as well.
          </p>
        </Panel>
      ) : null}
    </PageFrame>
  );
}
