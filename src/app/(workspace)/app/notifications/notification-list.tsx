"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { markNotificationsRead } from "@/app/(workspace)/app/notifications/actions";
import { Button } from "@/components/ui/button";
import { EVENT_LABELS } from "@/lib/notifications/labels";
import type { NoticeGroup } from "@/lib/portal/notification-list";
import { errorClass, helperClass } from "@/lib/ui";

export function NotificationList({ groups, readLabel }: { groups: NoticeGroup[]; readLabel: (value: string) => string }) {
  const [readKeys, setReadKeys] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = groups.map((group) => (readKeys.includes(group.key) ? { ...group, unread: false } : group));
  const unread = visible.filter((group) => group.unread);

  function mark(ids: string[], keys: string[]) {
    startTransition(async () => {
      const result = await markNotificationsRead(ids);
      if (result.status === "error") {
        setMessage(result.error);
        return;
      }
      setReadKeys((current) => [...current, ...keys]);
      setMessage(null);
    });
  }

  return (
    <div className="space-y-4">
      {unread.length ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={pending}
          onClick={() => mark(unread.flatMap((group) => group.ids), unread.map((group) => group.key))}
        >
          Mark all as read
        </Button>
      ) : null}
      {message ? <p className={errorClass}>{message}</p> : null}
      {visible.length === 0 ? (
        <p className={helperClass}>Nothing yet. Alerts land here when there is something to do, and so do replies from your team.</p>
      ) : (
        <ul className="divide-y divide-overlay/[0.06]">
          {visible.map((group) => (
            <li key={group.key} className="flex flex-wrap items-start justify-between gap-3 py-4">
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold tracking-[0.14em] text-dim uppercase">
                  {EVENT_LABELS[group.eventType]}
                  {group.unread ? " · Unread" : ""}
                </span>
                <span className="mt-1 block text-sm text-strong">{group.title}</span>
                <span className={`mt-0.5 block ${helperClass}`}>{group.body}</span>
                <span className={helperClass}>
                  {readLabel(group.queuedAt)} · {group.channels.join(", ")}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link href={group.href}>Open</Link>
                </Button>
                {group.unread ? (
                  <Button type="button" variant="ghost" size="sm" loading={pending} onClick={() => mark(group.ids, [group.key])}>
                    Mark read
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
