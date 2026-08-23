"use client";

import { Select } from "@/components/ui/select";
import { filterLabel, inputCompactClass, btnSecondary, btnSizeSm } from "@/lib/ui";
import { RANGE_PRESETS, type ReportingRangeKey } from "@/lib/reporting/constants";
import type { ReportingRange } from "@/lib/reporting/range";

export function ReportingRangeForm({
  range,
  action,
}: {
  range: ReportingRange;
  action: string;
}) {
  return (
    <form method="get" action={action} className="mb-6 flex flex-wrap items-end gap-4">
      <label className="block">
        <span className={filterLabel}>Range</span>
        <Select name="range" defaultValue={range.key} density="compact">
          {RANGE_PRESETS.map((preset) => (
            <option key={preset.key} value={preset.key as ReportingRangeKey}>
              {preset.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className={filterLabel}>From</span>
        <input type="date" name="from" defaultValue={range.fromDate} className={inputCompactClass} />
      </label>
      <label className="block">
        <span className={filterLabel}>To</span>
        <input type="date" name="to" defaultValue={range.toDate} className={inputCompactClass} />
      </label>
      <button type="submit" className={`${btnSecondary} ${btnSizeSm}`}>
        Apply
      </button>
    </form>
  );
}
