"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";

import { useOrg } from "@/components/app/org-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { EVENT_LABELS } from "@/lib/notifications/labels";
import type { NotificationEventType } from "@/lib/notifications/types";

type InboxRow = {
  id: string;
  title: string;
  body: string;
  href: string;
  event_type: NotificationEventType;
  status: string;
  queued_at: string;
  acted_at: string | null;
};

export function NotificationInbox() {
  const { org } = useOrg();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<InboxRow[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, href, event_type, status, queued_at, acted_at")
      .eq("org_id", org.id)
      .neq("channel", "da_console")
      .in("status", ["queued", "sent", "delivered", "opened", "acted", "skipped"])
      .order("queued_at", { ascending: false })
      .limit(30);
    setRows((data as InboxRow[] | null) ?? []);
  }, [org.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  async function markActed(id: string) {
    const supabase = createClient();
    const now = new Date().toISOString();
    await supabase
      .from("notifications")
      .update({ status: "acted", acted_at: now, updated_at: now })
      .eq("id", id);
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, status: "acted", acted_at: now } : row))
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="relative rounded-xl p-2 text-silver transition-colors hover:bg-white/[0.05] hover:text-white"
        aria-label="Alerts"
      >
        <Bell className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent side="right" className="bg-ink-900 text-white" showCloseButton>
        <SheetHeader>
          <SheetTitle>Alerts</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-6">
          {rows.length === 0 ? (
            <p className="text-sm text-dim">Nothing waiting. Alerts land here when there is something to do.</p>
          ) : (
            rows.map((row) => {
              let href = "/app/queue";
              try {
                const url = new URL(row.href);
                url.searchParams.set("nid", row.id);
                href = `${url.pathname}${url.search}`;
              } catch {
                href = `/app/queue?nid=${row.id}`;
              }
              return (
              <div key={row.id} className="border-t border-white/[0.06] py-3 first:border-t-0">
                <p className="text-[10px] font-semibold tracking-[0.14em] text-dim uppercase">
                  {EVENT_LABELS[row.event_type]}
                </p>
                <p className="mt-1 text-sm text-white">{row.title}</p>
                <p className="mt-0.5 text-xs text-silver">{row.body}</p>
                <div className="mt-2">
                  <Button asChild variant="link" size="sm">
                    <Link
                      href={href}
                      onClick={() => {
                        void markActed(row.id);
                        setOpen(false);
                      }}
                    >
                      Open
                    </Link>
                  </Button>
                </div>
              </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
