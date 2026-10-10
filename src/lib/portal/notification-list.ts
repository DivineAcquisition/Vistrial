import { CHANNEL_LABELS } from "@/lib/notifications/labels";
import type { NotificationChannel, NotificationEventType } from "@/lib/notifications/types";

export type NoticeRow = {
  id: string;
  title: string;
  body: string;
  href: string;
  event_type: NotificationEventType;
  channel: NotificationChannel;
  status: string;
  queued_at: string;
  acted_at: string | null;
  dedupe_key: string;
};

export type NoticeGroup = {
  key: string;
  title: string;
  body: string;
  href: string;
  eventType: NotificationEventType;
  channels: string[];
  queuedAt: string;
  unread: boolean;
  ids: string[];
};

const READ = new Set(["acted", "skipped"]);

/** One line per alert. Email and push of the same alert share a title, body, and minute. */
export function groupNotifications(rows: NoticeRow[]): NoticeGroup[] {
  const groups = new Map<string, NoticeGroup>();
  for (const row of rows) {
    const key = `${row.event_type}|${row.title}|${row.body}|${row.queued_at.slice(0, 16)}`;
    const unread = !row.acted_at && !READ.has(row.status);
    const channel = CHANNEL_LABELS[row.channel] ?? row.channel;
    const existing = groups.get(key);
    if (existing) {
      if (!existing.channels.includes(channel)) existing.channels.push(channel);
      existing.ids.push(row.id);
      existing.unread = existing.unread || unread;
      if (row.queued_at < existing.queuedAt) existing.queuedAt = row.queued_at;
      continue;
    }
    groups.set(key, {
      key,
      title: row.title,
      body: row.body,
      href: noticePath(row.href),
      eventType: row.event_type,
      channels: [channel],
      queuedAt: row.queued_at,
      unread,
      ids: [row.id],
    });
  }
  return [...groups.values()].sort((a, b) => (a.queuedAt < b.queuedAt ? 1 : -1));
}

/** Keep the in-app path. Outside links open as the path only when they are ours. */
export function noticePath(href: string): string {
  if (href.startsWith("/") && !href.startsWith("//")) return href.split("#")[0] ?? href;
  try {
    const url = new URL(href);
    if (url.pathname.startsWith("/app") || url.pathname.startsWith("/portal")) {
      return `${url.pathname}${url.search}`;
    }
  } catch {
    return "/app/notifications";
  }
  return "/app/notifications";
}
