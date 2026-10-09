import Link from "next/link";

import { Card } from "@/components/ui/card";

export function ResponseHealth({
  onTime,
  atRisk,
  missed,
  watched,
}: {
  onTime: number;
  atRisk: number;
  missed: number;
  watched: number;
}) {
  const percent = watched === 0 ? null : Math.round((onTime / watched) * 100);
  return (
    <Card className="space-y-2 p-4">
      <h2 className="text-sm font-semibold">Response health</h2>
      <p className="text-sm text-muted-foreground">
        {percent == null ? "Sentry is not watching any leads yet." : `${percent}% of watched leads are on time.`}
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="underline underline-offset-2" href="/app/cases?response=at_risk">{atRisk} at risk</Link>
        <Link className="underline underline-offset-2" href="/app/cases?response=missed">{missed} missed</Link>
        <Link className="underline underline-offset-2" href="/app/cases">{watched} watched</Link>
      </div>
    </Card>
  );
}
