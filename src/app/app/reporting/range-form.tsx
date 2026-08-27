"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { filterLabel } from "@/lib/ui";
import { RANGE_PRESETS, type ReportingRangeKey } from "@/lib/reporting/constants";
import type { ReportingRange } from "@/lib/reporting/range";

export function ReportingRangeForm({
  range,
  action,
}: {
  range: ReportingRange;
  action: string;
}) {
  const [key, setKey] = useState<ReportingRangeKey>(range.key);
  const [from, setFrom] = useState(range.fromDate);
  const [to, setTo] = useState(range.toDate);

  return (
    <form method="get" action={action} className="mb-6 flex flex-wrap items-end gap-4">
      <label className="block">
        <span className={filterLabel}>Range</span>
        <Select
          name="range"
          value={key}
          density="compact"
          onChange={(event) => setKey(event.target.value as ReportingRangeKey)}
        >
          {RANGE_PRESETS.map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="block min-w-64 flex-1">
        <span className={filterLabel}>Dates</span>
        <DateRangePicker
          from={from}
          to={to}
          nameFrom="from"
          nameTo="to"
          onChange={(next) => {
            setFrom(next.from ?? "");
            setTo(next.to ?? "");
            setKey("custom");
          }}
          placeholder="Custom range"
        />
      </label>
      <Button type="submit" variant="secondary" size="sm">
        Apply
      </Button>
    </form>
  );
}
