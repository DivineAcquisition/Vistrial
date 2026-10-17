import Link from "next/link";

import { saveMapping, startImport, uploadSheet } from "@/app/(workspace)/app/settings/connections/actions";
import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { Panel } from "@/components/ui/panel";
import { connectorByKey } from "@/lib/connectors/catalog";
import { managesConnections, requireConnectionViewer } from "@/lib/connectors/gate";
import { ensureWebhook, loadConnection } from "@/lib/connectors/store";
import { appUrl } from "@/lib/app-url";
import { cardTitle, helperClass } from "@/lib/ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ connector: string }>;
  searchParams: Promise<{ connection?: string; connected?: string; secret?: string }>;
}) {
  const ctx = await requireConnectionViewer();
  const { connector: key } = await params;
  const query = await searchParams;
  const connector = connectorByKey(key);
  if (!connector || !query.connection) notFound();
  const row = await loadConnection(ctx.org.id, query.connection);
  if (!row || row.connector_key !== key) notFound();
  const canManage = managesConnections(ctx);
  const hook = connector.method === "webhook" ? await ensureWebhook(row.id, ctx.org.id) : null;

  return (
    <PageFrame title={`Set up ${connector.name}`} description="Each step saves as you go. You can leave and come back.">
      {query.connected ? <Notice tone="success" title="Connected">{`Connected to ${query.connected}.`}</Notice> : null}
      <Panel className="p-6">
        <h2 className={cardTitle}>1. Choose what comes in</h2>
        <p className={`${helperClass} mt-2`}>Anything you leave out is not read beyond the list you see here.</p>
        <form action={saveMapping} className="mt-4 grid gap-3">
          <input type="hidden" name="connection" value={row.id} />
          <label className="text-sm text-white" htmlFor="include">What to include</label>
          <textarea id="include" name="include" defaultValue={String(row.setup.include ?? "")} rows={3} className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Pipelines, tables, or calendars to include" />
          <label className="text-sm text-white" htmlFor="stages">Stage and field matching</label>
          <textarea id="stages" name="stages" defaultValue={String(row.setup.stages ?? "")} rows={3} className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Unmatched stages stay flagged. They are not guessed." />
          <label className="text-sm text-white" htmlFor="record">Which source is the record</label>
          <input id="record" name="record" defaultValue={String(row.setup.record ?? "")} className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Only needed when two sources cover the same fields" />
          {canManage || ctx.isStaff ? <Button type="submit" variant="secondary">Save this step</Button> : null}
        </form>
      </Panel>

      {hook ? (
        <Panel className="p-6">
          <h2 className={cardTitle}>Webhook address</h2>
          <p className="mt-3 break-all text-sm text-white">{`${appUrl()}/api/connectors/hooks/${hook.token}`}</p>
          <p className={`${helperClass} mt-2`}>
            Put this address in the tool that sends events. Sign the body with the secret and send it as x-vistrial-signature.
            <Link href="/guides/webhook" className="ml-1 text-brand-300 underline">Payload guide</Link>
          </p>
          {hook.secret ? <p className="mt-3 text-sm text-white">Signing secret, shown once: {hook.secret}</p> : null}
          {query.secret ? <p className="mt-3 text-sm text-white">New signing secret, shown once: {query.secret}</p> : null}
        </Panel>
      ) : null}

      {connector.method === "upload" ? (
        <Panel className="p-6">
          <h2 className={cardTitle}>Upload a spreadsheet</h2>
          <p className={`${helperClass} mt-2`}>
            Past records is the only mode available. Those rows will not trigger alerts, tasks, or drafts.
            <Link href="/app/settings/connections/template" className="ml-1 text-brand-300 underline">Download a template</Link>
          </p>
          <form action={uploadSheet} className="mt-4 grid gap-3">
            <input type="hidden" name="mode" value="past" />
            <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
            {canManage ? <Button type="submit">Import as past records</Button> : null}
          </form>
        </Panel>
      ) : null}

      <Panel className="p-6">
        <h2 className={cardTitle}>Preview and start</h2>
        <p className="mt-3 text-sm text-white">
          Nothing is written until you start the import. History comes in quietly. New activity after go-live can start clocks and drafts.
        </p>
        {canManage ? (
          <form action={startImport} className="mt-4">
            <input type="hidden" name="connection" value={row.id} />
            <Button type="submit">Start import</Button>
          </form>
        ) : (
          <p className={`${helperClass} mt-3`}>Setup is saved at step {row.setup_step ?? "choose"}.</p>
        )}
      </Panel>
    </PageFrame>
  );
}
