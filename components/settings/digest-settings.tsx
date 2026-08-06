"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setDigestHourAction } from "@/lib/actions/attention";
import { btnPrimary, btnSizeSm, helperClass, labelClass, selectClass } from "@/lib/ui";

export function DigestSettings({ hour }: { hour: number }) {
  const [value, setValue] = useState(String(hour));
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await setDigestHourAction({ hour: Number(value) });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Digest hour saved.");
        });
      }}
    >
      <div>
        <label className={labelClass} htmlFor="digest-hour">
          Send at (UTC)
        </label>
        <select
          id="digest-hour"
          className={selectClass}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        >
          {Array.from({ length: 24 }, (_, hourOption) => (
            <option key={hourOption} value={hourOption}>
              {String(hourOption).padStart(2, "0")}:00 UTC
            </option>
          ))}
        </select>
        <p className={helperClass}>
          Sent only when something is outstanding. Schedule the job hourly; it
          fires at this hour.
        </p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className={`${btnPrimary} ${btnSizeSm}`}
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
