import { redirect } from "next/navigation";

import { parseHomePeriodKey } from "@/lib/home/periods";

export const dynamic = "force-dynamic";

/** Older Home links. Each number now lives in Results with the same definition as its card. */
const MOVED: Record<string, string> = {
  booked_calls: "bookings",
  first_reply_time: "first_touch_time",
  revenue_booked: "revenue",
};

export default async function HomeMetricPage({
  params,
  searchParams,
}: {
  params: Promise<{ metric: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { metric } = await params;
  const period = parseHomePeriodKey((await searchParams).period);
  const target = MOVED[metric];
  redirect(target ? `/app/results/leads?metric=${target}&period=${period}` : `/app/results?period=${period}`);
}
