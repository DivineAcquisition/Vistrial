"use client";

import { Textarea } from "@/components/ui/textarea";
import { labelClass, helperClass, btnPrimary, btnSizeMd } from "@/lib/ui";

export function ClientSummaryForm({ summary, query }: { summary: string; query: string }) {
  return (
    <form method="post" action={`/app/reporting/export/pdf?${query}`} className="space-y-3">
      <label htmlFor="summary" className={labelClass}>
        Plain-language summary
      </label>
      <Textarea id="summary" name="summary" defaultValue={summary} rows={10} />
      <p className={helperClass}>
        Review this before export. It is generated from the numbers on this page. If nothing improved, it
        says so. Do not add language that credits Vistrial with a close or with revenue — the export will
        refuse it.
      </p>
      <button type="submit" className={`${btnPrimary} ${btnSizeMd}`}>
        Export PDF
      </button>
    </form>
  );
}
