"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export function ClientSummaryForm({
  summary,
  query,
  action,
}: {
  summary: string;
  query: string;
  action?: string;
}) {
  return (
    <form method="post" action={action ?? `/app/reporting/export/pdf?${query}`} className="flex flex-col gap-3">
      <Field
        label="Plain-language summary"
        name="summary"
        help="Review this before export. It is generated from the numbers on this page. If nothing improved, it says so. Do not add language that credits Vistrial with a close or with revenue — the export will refuse it."
      >
        <Textarea
          id="summary"
          name="summary"
          defaultValue={summary}
          rows={10}
          placeholder="In this period, inbound leads were worked in X days on average…"
        />
      </Field>
      <Button type="submit" variant="primary" size="lg">
        Export PDF
      </Button>
    </form>
  );
}
