import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { Card } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth/session";
import { API_LIMITS, API_SCOPES } from "@/lib/api/v1/limits";
import { createClient } from "@/lib/supabase/server";
import { createApiKey, revokeApiKey, saveWebhook } from "@/app/(workspace)/app/settings/developers/actions";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Developers" };

export default async function DevelopersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getAuthContext();
  const staff = ctx.workspaceRole === "service_team" || ctx.workspaceRole === "platform_admin";
  if (ctx.workspaceRole !== "owner" && !staff) notFound();
  const query = await searchParams;
  const created = Array.isArray(query.created) ? query.created[0] : query.created;
  const jar = await cookies();
  const secret = created === "key" ? jar.get("vistrial_key_once")?.value : undefined;
  const signing = created === "signing" ? jar.get("vistrial_signing_once")?.value : undefined;
  const db = (await createClient()) as unknown as SupabaseClient;
  const [{ data: access }, { data: keys }, { data: hooks }, { data: usage }] = await Promise.all([
    db.rpc("billing_feature", { p_org_id: ctx.org.id, p_key: "api_access" }),
    db.from("api_keys").select("id, name, prefix, mode, scopes, expires_at, last_used_at, revoked_at, created_at").eq("org_id", ctx.org.id).order("created_at", { ascending: false }),
    db.from("webhook_endpoints").select("id, name, url, events, enabled, disabled_reason, failure_count, include_data").eq("org_id", ctx.org.id),
    db.from("api_request_log").select("status, created_at").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(20),
  ]);
  const enabled = access === true;
  return (
    <PageFrame
      title="Developers"
      description="Keys and webhooks for this workspace. A key is shown once. It cannot send a message or approve a draft."
    >
      {!enabled ? (
        <Card className="space-y-2 p-4">
          <h2 className="text-sm font-semibold">API access is not on for this workspace</h2>
          <p className="text-sm text-muted-foreground">
            Ask the Vistrial team to turn it on. While it is on, a workspace can have {API_LIMITS.keys} keys, {API_LIMITS.dailyRequests.toLocaleString()} requests a day, {API_LIMITS.webhookEndpoints} webhook addresses, and {API_LIMITS.eventsPerMonth.toLocaleString()} events a month. There is no overage charge.
          </p>
        </Card>
      ) : null}
      {secret ? (
        <Card className="space-y-2 border-warning p-4">
          <h2 className="text-sm font-semibold">Copy this key now</h2>
          <p className="break-all font-mono text-sm">{secret}</p>
          <p className="text-sm text-muted-foreground">It will not be shown again.</p>
        </Card>
      ) : null}
      {signing ? (
        <Card className="space-y-2 border-warning p-4">
          <h2 className="text-sm font-semibold">Copy this signing secret now</h2>
          <p className="break-all font-mono text-sm">{signing}</p>
          <p className="text-sm text-muted-foreground">
            Each delivery includes Vistrial-Signature: t=timestamp,v1=signature. Compute HMAC SHA-256 of timestamp, a period, and the raw body.
          </p>
        </Card>
      ) : null}
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Keys</h2>
        <ul className="space-y-2 text-sm">
          {((keys ?? []) as Array<{ id: string; name: string; prefix: string; mode: string; scopes: string[]; last_used_at: string | null; revoked_at: string | null }>).map((key) => (
            <li key={key.id} className="flex flex-col gap-1 border-b pb-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {key.name} · {key.prefix} · {key.mode}
                {key.revoked_at ? " · revoked" : ""} · last used {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "never"}
              </span>
              {!key.revoked_at ? (
                <form action={revokeApiKey}>
                  <input type="hidden" name="id" value={key.id} />
                  <button type="submit" className="text-sm text-destructive">Revoke</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {ctx.workspaceRole === "owner" && enabled ? (
          <form action={createApiKey} className="grid gap-2">
            <input name="name" required placeholder="Key name" className="rounded-md border bg-background px-2 py-1" />
            <label className="text-sm"><input type="checkbox" name="test" /> Test key. It only sees practice rows.</label>
            <fieldset className="grid gap-1 text-sm sm:grid-cols-2">
              {API_SCOPES.map((scope) => (
                <label key={scope}><input type="checkbox" name="scopes" value={scope} /> {scope}</label>
              ))}
            </fieldset>
            <button type="submit" className="w-fit rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Create key</button>
          </form>
        ) : null}
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Webhooks</h2>
        <p className="text-sm text-muted-foreground">Events are thin: an id, a type, and the record ids. Your system fetches details with its own key. Ordering is not guaranteed. Use the time and sequence to reconcile.</p>
        <ul className="space-y-2 text-sm">
          {((hooks ?? []) as Array<{ id: string; name: string; url: string; enabled: boolean; disabled_reason: string | null; failure_count: number }>).map((hook) => (
            <li key={hook.id}>
              {hook.name} · {hook.url} · {hook.enabled ? "on" : "off"}
              {hook.disabled_reason ? ` · ${hook.disabled_reason}` : ""} · failures {hook.failure_count}
            </li>
          ))}
        </ul>
        {ctx.workspaceRole === "owner" && enabled ? (
          <form action={saveWebhook} className="grid gap-2">
            <input name="name" required placeholder="Name" className="rounded-md border bg-background px-2 py-1" />
            <input name="url" required placeholder="https://example.com/vistrial" className="rounded-md border bg-background px-2 py-1" />
            <input name="events" required placeholder="lead.created, booking.created" className="rounded-md border bg-background px-2 py-1" />
            <label className="text-sm"><input type="checkbox" name="include_data" /> Include a small set of fields. The destination is outside Vistrial.</label>
            <button type="submit" className="w-fit rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Add endpoint</button>
          </form>
        ) : null}
      </Card>
      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">Recent requests</h2>
        <ul className="text-sm text-muted-foreground">
          {((usage ?? []) as Array<{ status: number; created_at: string }>).map((row, index) => (
            <li key={`${row.created_at}-${index}`}>{new Date(row.created_at).toLocaleString()} · {row.status}</li>
          ))}
        </ul>
        <p className="text-sm">
          <a href="/developers" className="text-brand-300 underline-offset-4 hover:underline">Read the API documentation</a>
        </p>
      </Card>
    </PageFrame>
  );
}
