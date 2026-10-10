import { NotificationList } from "@/app/(workspace)/app/notifications/notification-list";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { getAuthContext } from "@/lib/auth/session";
import { formatRelative } from "@/lib/format";
import { groupNotifications, type NoticeRow } from "@/lib/portal/notification-list";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Notifications" };

/** The person's own alerts. The same alert on email and push is one line. */
export default async function NotificationsPage() {
  const ctx = await getAuthContext();
  const db = await createClient();
  const now = new Date().toISOString();
  const { data } = await db
    .from("notifications")
    .select("id, title, body, href, event_type, channel, status, queued_at, acted_at, dedupe_key")
    .eq("org_id", ctx.org.id)
    .eq("recipient_user_id", ctx.user.id)
    .neq("channel", "da_console")
    .in("status", ["queued", "sent", "delivered", "opened", "acted", "skipped"])
    .order("queued_at", { ascending: false })
    .limit(80);
  const groups = groupNotifications((data ?? []) as NoticeRow[]);

  return (
    <PageFrame
      title="Notifications"
      description="Alerts for you in this workspace. Changing what you get happens in settings."
    >
      <Panel className="p-6">
        <NotificationList groups={groups} readLabel={(value) => formatRelative(value, now)} />
      </Panel>
    </PageFrame>
  );
}
