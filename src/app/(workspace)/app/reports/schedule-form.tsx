"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { saveReportSchedule } from "@/app/(workspace)/app/reports/actions";

export function ScheduleForm({ reportKey }: { reportKey: string }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Send this on a schedule</h2>
      <p className="text-sm text-muted-foreground">
        The email has the headline counts and a link back here. It does not name leads. A PDF stays in Vistrial until you download it, because email is not a secure place for a file.
      </p>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        action={async (formData) => {
          const result = await saveReportSchedule(formData);
          setMessage(result.message);
        }}
      >
        <input type="hidden" name="report" value={reportKey} />
        <label className="text-sm">
          How often
          <select name="cadence" className="mt-1 block rounded-md border bg-background px-2 py-1">
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <Button type="submit">Save schedule</Button>
      </form>
      {message ? <p className="text-sm">{message}</p> : null}
    </Card>
  );
}
