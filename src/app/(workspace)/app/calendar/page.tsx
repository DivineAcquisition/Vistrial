import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SalesCalendarScreen } from "@/components/calendar/sales-calendar";
import { PageFrame } from "@/components/app/page-frame";
import { initialRange } from "@/lib/calendar/model";
import { loadSalesCalendar, salesCalendarEnabled } from "@/lib/calendar/load";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as SupabaseClient;
  if (!(await salesCalendarEnabled(db, ctx.org.id))) notFound();
  const range = initialRange(ctx.org.timezone || "America/New_York", new Date());
  const initial = await loadSalesCalendar(ctx, range);
  if (!initial) notFound();
  return (
    <PageFrame
      title="Calendar"
      description="Calls, tasks, drafts, and reply windows on the schedule. Nothing here sends a message."
    >
      <SalesCalendarScreen initial={initial} memberId={ctx.member.id} />
    </PageFrame>
  );
}
