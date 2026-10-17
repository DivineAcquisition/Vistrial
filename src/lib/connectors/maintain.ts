import "server-only";

import { connectorByKey } from "@/lib/connectors/catalog";
import { attentionDigestAllowed, reconnectReminderHours } from "@/lib/connectors/reminders";
import { evaluateFreshness } from "@/lib/connectors/status";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listConnections, notifyReconnect, purgeExpiredRawFiles, setConnectionStatus } from "@/lib/connectors/store";
import { syncConnection } from "@/lib/connectors/sync";

export async function notifyOwnersHistory(orgId: string, tool: string): Promise<void> {
  const { data } = await getSupabaseAdmin()
    .from("org_members")
    .select("id, user_id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .eq("active", true);
  for (const owner of data ?? []) {
    if (!owner.user_id) continue;
    await enqueueNotification(getSupabaseAdmin(), {
      orgId,
      eventType: "onboarding",
      channel: "email",
      recipientUserId: owner.user_id,
      recipientMemberId: owner.id,
      subjectIds: [],
      title: `Your ${tool} history is in`,
      body: `Your ${tool} history is in. Vistrial is now watching for new activity.`,
      href: "/app/settings/connections",
      dedupeKey: `history-in:${orgId}:${tool}:${owner.id}`,
    });
  }
}

export async function maintainConnections(): Promise<{ checked: number }> {
  const admin = getSupabaseAdmin() as unknown as {
    from: (table: string) => {
      select: (q?: string) => {
        limit: (n: number) => Promise<{ data: Array<{ org_id: string }> | null }>;
      };
    };
  };
  const orgs = await admin.from("workspace_connections").select("org_id").limit(200);
  const ids = [...new Set((orgs.data ?? []).map((row) => row.org_id))];
  const now = Date.now();
  for (const orgId of ids) {
    const rows = await listConnections(orgId);
    for (const row of rows) {
      const connector = connectorByKey(row.connector_key);
      if (!connector) continue;
      const next = evaluateFreshness({
        state: row.status as "live",
        delayMs: connector.delayMs,
        quietIsOk: connector.quietIsOk,
        lastUpdateAt: row.last_update_at ? Date.parse(row.last_update_at) : null,
        lastFullCheckAt: row.last_full_check_at ? Date.parse(row.last_full_check_at) : null,
        now,
        failure: null,
      });
      if (next !== row.status && (row.status === "live" || row.status === "delayed")) {
        await setConnectionStatus({
          orgId,
          connectionId: row.id,
          status: next,
          detail: next === "delayed" ? `Updates from ${connector.name} are running behind. No action needed.` : null,
          action: "connection.freshness",
        });
      }
      if (row.status === "live" || row.status === "delayed" || row.status === "setting_up") {
        await syncConnection(row).catch(() => undefined);
      }
      if (row.status === "needs_reconnecting") {
        const hours = reconnectReminderHours(row.test_mode);
        const ageHours = (now - Date.parse(row.updated_at ?? row.created_at)) / (60 * 60 * 1000);
        const step = hours.filter((hour) => ageHours >= hour).length;
        if (step > (row.reconnect_notice_step ?? 0)) {
          await notifyReconnect({
            orgId,
            connectorName: connector.name,
            connectionId: row.id,
            testMode: row.test_mode,
            step,
          });
          await patchConnection(row.id, { reconnect_notice_step: step });
        }
      }
      if (row.connector_key === "gohighlevel" && row.status === "importing") {
        await finishGhlImport(orgId, row.id);
      }
      if (row.connected_by_member_id && !row.author_removed_at) {
        await flagRemovedAuthor(orgId, row.id, row.connected_by_member_id, connector.name);
      }
      if (row.status === "needs_attention" && attentionDigestAllowed(row.attention_notified_at ? Date.parse(row.attention_notified_at) : null, now)) {
        const { data: owners } = await getSupabaseAdmin()
          .from("org_members")
          .select("id, user_id")
          .eq("org_id", orgId)
          .eq("role", "owner")
          .eq("active", true);
        for (const owner of owners ?? []) {
          if (!owner.user_id) continue;
          await enqueueNotification(getSupabaseAdmin(), {
            orgId,
            eventType: "workspace_notice",
            channel: "email",
            recipientUserId: owner.user_id,
            recipientMemberId: owner.id,
            subjectIds: [],
            title: `${connector.name} needs a match`,
            body: row.status_detail ?? `A new value in ${connector.name} needs a match so leads show up correctly.`,
            href: `/app/settings/connections/view/${row.id}`,
            dedupeKey: `attention:${row.id}:${new Date(now).toISOString().slice(0, 10)}:${owner.id}`,
          });
        }
      }
    }
  }
  await purgeExpiredRawFiles();
  return { checked: ids.length };
}

type Patch = {
  from: (table: string) => {
    update: (row: object) => { eq: (column: string, value: string) => Promise<unknown> };
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options: { ascending: boolean }) => {
          limit: (count: number) => Promise<{ data: Array<{ status: string }> | null }>;
        };
        maybeSingle: () => Promise<{ data: { active: boolean } | null }>;
      };
    };
  };
};

function patchDb(): Patch {
  return getSupabaseAdmin() as unknown as Patch;
}

async function patchConnection(id: string, row: object): Promise<void> {
  await patchDb().from("workspace_connections").update(row).eq("id", id);
}

async function finishGhlImport(orgId: string, connectionId: string): Promise<void> {
  const result = await patchDb()
    .from("onboarding_import_runs")
    .select("status")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (result.data?.[0]?.status !== "done") return;
  await setConnectionStatus({
    orgId,
    connectionId,
    status: "live",
    detail: null,
    action: "connection.live",
  });
  await notifyOwnersHistory(orgId, "GoHighLevel");
}

async function flagRemovedAuthor(orgId: string, connectionId: string, memberId: string, tool: string): Promise<void> {
  const member = await getSupabaseAdmin().from("org_members").select("active").eq("id", memberId).maybeSingle();
  if (!member.data || member.data.active) return;
  const now = new Date().toISOString();
  await patchConnection(connectionId, {
    author_removed_at: now,
    status_detail: "Connected by someone who no longer has access. Reconnect to keep this under your control.",
  });
  const { data: owners } = await getSupabaseAdmin()
    .from("org_members")
    .select("id, user_id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .eq("active", true);
  for (const owner of owners ?? []) {
    if (!owner.user_id) continue;
    await enqueueNotification(getSupabaseAdmin(), {
      orgId,
      eventType: "workspace_notice",
      channel: "email",
      recipientUserId: owner.user_id,
      recipientMemberId: owner.id,
      subjectIds: [],
      title: `${tool} needs a reconnect`,
      body: "Connected by someone who no longer has access. Reconnect to keep this under your control.",
      href: `/app/settings/connections/view/${connectionId}`,
      dedupeKey: `author-removed:${connectionId}:${owner.id}`,
    });
  }
}
