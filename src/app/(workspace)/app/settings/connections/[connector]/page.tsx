import Link from "next/link";

import { connectApiKey, connectSimple, sendConnectLink } from "@/app/(workspace)/app/settings/connections/actions";
import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { Panel } from "@/components/ui/panel";
import { connectorByKey } from "@/lib/connectors/catalog";
import { managesConnections, requireConnectionViewer } from "@/lib/connectors/gate";
import { connectorEnabled } from "@/lib/connectors/store";
import { vendorConfigured } from "@/lib/connectors/vendors";
import { LocationPicker } from "@/components/integrations/location-picker";
import { listSessionLocations } from "@/lib/ghl/connect";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cardTitle, helperClass } from "@/lib/ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  expired: "This connection link expired or was opened in a different session. Please try again.",
  mismatch: "This connection link expired or was opened in a different session. Please try again.",
  partial: "Some permissions were not granted. Nothing was saved. Try again and allow the permissions listed on this page.",
  failed: "The connection could not be completed. Nothing was changed.",
  already: "This file was already imported. Uploading it again will not create duplicates.",
  active_off: "Active leads to work now is turned off. Import the file as past records.",
};

export default async function ToolPage({
  params,
  searchParams,
}: {
  params: Promise<{ connector: string }>;
  searchParams: Promise<{ error?: string; notice?: string; missing?: string; invite?: string; imported?: string; select_location?: string }>;
}) {
  const ctx = await requireConnectionViewer();
  const { connector: key } = await params;
  const query = await searchParams;
  const connector = connectorByKey(key);
  if (!connector) notFound();
  const canManage = managesConnections(ctx);
  const enabled = connector.availability === "connect" && (await connectorEnabled(ctx.org.id, connector.key));
  const locations =
    connector.key === "gohighlevel" && query.select_location === "1"
      ? await listSessionLocations(getSupabaseAdmin(), ctx.org.id, ctx.member.id)
      : [];
  const oauthHref = connector.key === "gohighlevel"
    ? "/api/leadconnector/oauth/start?from=connections"
    : `/api/connectors/oauth/start?connector=${connector.key}`;

  return (
    <PageFrame title={connector.name} description={connector.summary}>
      {query.notice ? <Notice tone="info" title="Nothing was changed">{query.notice}</Notice> : null}
      {query.error ? (
        <Notice tone="warning" title="Try again">
          {ERRORS[query.error] ?? query.error}
          {query.missing ? ` Missing: ${query.missing}` : ""}
        </Notice>
      ) : null}
      {query.imported ? <Notice tone="success" title="Imported">Past records were imported. They will not trigger alerts or drafts.</Notice> : null}
      {query.invite ? (
        <Notice tone="info" title="Connect link">
          Send this to the Owner. It does not authorize the tool. {query.invite}
        </Notice>
      ) : null}
      {connector.testModeNote ? <Notice tone="info" title="Testing">{connector.testModeNote}</Notice> : null}
      {locations.length ? <LocationPicker locations={locations} /> : null}

      <Panel className="p-6">
        <h2 className={cardTitle}>What Vistrial will read</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white">
          {connector.reads.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <p className={`${helperClass} mt-4`}>{connector.doesNotRead}</p>
      </Panel>
      <Panel className="p-6">
        <h2 className={cardTitle}>What Vistrial will never do without your permission</h2>
        <p className="mt-3 text-sm text-white">{connector.neverDoes}</p>
      </Panel>
      {connector.permissions.length ? (
        <Panel className="p-6">
          <h2 className={cardTitle}>Permissions</h2>
          <ul className="mt-3 space-y-2">
            {connector.permissions.map((row) => (
              <li key={row.scope}>
                <p className="text-sm text-white">{row.scope}</p>
                <p className={helperClass}>{row.reason}</p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Panel className="p-6">
        <p className="text-sm text-white">{connector.firstImport}</p>
        <p className={`${helperClass} mt-2`}>
          <Link href="/security" className="text-brand-300 underline">Learn more on the Security page</Link>
        </p>
        {connector.key === "fathom" || connector.key === "fireflies" ? (
          <p className={`${helperClass} mt-2`}>Transcripts are only visible to the roles allowed to see them.</p>
        ) : null}
        <div className="mt-5">
          {connector.availability !== "connect" || !enabled ? (
            <p className={helperClass}>This tool is not available to connect yet.</p>
          ) : !canManage ? (
            <p className={helperClass}>You can view this tool. An Owner can connect it.</p>
          ) : connector.method === "oauth" && (vendorConfigured(connector.key) || connector.key === "gohighlevel") ? (
            <Button render={<a href={oauthHref} />}>Connect</Button>
          ) : connector.method === "api_key" ? (
            <form action={connectApiKey} className="grid gap-3">
              <input type="hidden" name="connector" value={connector.key} />
              <p className={helperClass}>
                In {connector.name}, open the developer or API settings and create a key that can read meetings. Paste it here once.
                It is tested immediately, then only the last four characters are shown.
              </p>
              <label className="text-sm text-white" htmlFor="secret">API key</label>
              <input id="secret" name="secret" type="password" autoComplete="off" required className="rounded-md border bg-background px-3 py-2 text-sm" />
              <Button type="submit">Test and save</Button>
            </form>
          ) : (
            <form action={connectSimple}>
              <input type="hidden" name="connector" value={connector.key} />
              <Button type="submit">Continue</Button>
            </form>
          )}
        </div>
        {ctx.isStaff ? (
          <form action={sendConnectLink} className="mt-4">
            <input type="hidden" name="connector" value={connector.key} />
            <Button type="submit" variant="secondary">Send a connect link</Button>
          </form>
        ) : null}
      </Panel>
    </PageFrame>
  );
}
