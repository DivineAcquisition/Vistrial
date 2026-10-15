import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { Card } from "@/components/ui/card";
import { canSeePeople, canSeeResults } from "@/lib/auth/portal-access";
import { getAuthContext } from "@/lib/auth/session";
import { BUILT_IN_REPORTS } from "@/lib/reports/builtin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await getAuthContext();
  if (!canSeeResults(ctx)) notFound();
  const people = canSeePeople(ctx);
  const reports = BUILT_IN_REPORTS.filter((report) => !report.people || people);
  return (
    <PageFrame
      title="Reports"
      description="The same numbers as Results, saved so you can share them, schedule them, or hand a month to a customer."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {reports.map((report) => (
          <Link key={report.key} href={`/app/reports/${report.key}`} className="block">
            <Card className="h-full space-y-2 p-4 hover:bg-muted/40">
              <h2 className="text-base font-semibold">{report.title}</h2>
              <p className="text-sm text-muted-foreground">{report.howToRead}</p>
            </Card>
          </Link>
        ))}
      </div>
      {people ? (
        <p className="text-sm text-muted-foreground">
          <Link href="/app/reports/client" className="font-medium text-brand-300 underline-offset-4 hover:underline">
            Monthly client reports
          </Link>{" "}
          are prepared by the Vistrial team and released only after a person reviews them.
        </p>
      ) : null}
    </PageFrame>
  );
}
