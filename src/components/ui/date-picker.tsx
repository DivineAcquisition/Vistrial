"use client";

import type { DateRange } from "@daypicker/react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { formatIsoDate, parseIsoDate } from "@/lib/dates/iso";
import { cn } from "@/lib/utils";

function rangeLabel(from: Date | undefined, to: Date | undefined, empty: string): string {
  if (from && to) return `${format(from, "LLL d, y")} – ${format(to, "LLL d, y")}`;
  if (from) return format(from, "LLL d, y");
  return empty;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  density = "compact",
  placeholder = "Pick a date range",
  disabled = false,
  id,
  nameFrom,
  nameTo,
  className,
}: {
  from: string | null;
  to: string | null;
  onChange: (next: { from: string | null; to: string | null }) => void;
  density?: "compact" | "default";
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  nameFrom?: string;
  nameTo?: string;
  className?: string;
}) {
  const selected = useMemo<DateRange | undefined>(() => {
    const start = parseIsoDate(from);
    if (!start) return undefined;
    return { from: start, to: parseIsoDate(to) };
  }, [from, to]);
  const [month, setMonth] = useState<Date>(selected?.from ?? new Date());
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("w-full min-w-0", className)}>
      {nameFrom ? <input type="hidden" name={nameFrom} value={from ?? ""} /> : null}
      {nameTo ? <input type="hidden" name={nameTo} value={to ?? ""} /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          render={
            <Button
              id={id}
              variant="outline"
              size={density === "compact" ? "sm" : "default"}
              className="w-full min-w-56 justify-start font-normal"
              disabled={disabled}
            />
          }
        >
          <CalendarIcon aria-hidden="true" />
          <span className={cn("truncate", !selected?.from && "text-muted-foreground")}>
            {rangeLabel(selected?.from, selected?.to, placeholder)}
          </span>
        </PopoverTrigger>
        <PopoverPopup align="start" className="w-auto p-0">
          <Calendar
            mode="range"
            month={month}
            numberOfMonths={1}
            onMonthChange={setMonth}
            onSelect={(next) => {
              const start = next?.from ? formatIsoDate(next.from) : null;
              const end = next?.to ? formatIsoDate(next.to) : null;
              onChange({ from: start, to: end });
              if (next?.from && next.to) setOpen(false);
            }}
            selected={selected}
          />
        </PopoverPopup>
      </Popover>
    </div>
  );
}

export function DatePicker({
  value,
  onChange,
  density = "compact",
  placeholder = "Pick a date",
  disabled = false,
  id,
  name,
  className,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  density?: "compact" | "default";
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
}) {
  const selected = parseIsoDate(value);
  const [month, setMonth] = useState<Date>(selected ?? new Date());
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("w-full min-w-0", className)}>
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          render={
            <Button
              id={id}
              variant="outline"
              size={density === "compact" ? "sm" : "default"}
              className="w-full min-w-44 justify-start font-normal"
              disabled={disabled}
            />
          }
        >
          <CalendarIcon aria-hidden="true" />
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? format(selected, "PPP") : placeholder}
          </span>
        </PopoverTrigger>
        <PopoverPopup align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            month={month}
            onMonthChange={setMonth}
            onSelect={(next) => {
              onChange(next ? formatIsoDate(next) : null);
              if (next) setOpen(false);
            }}
            selected={selected}
          />
        </PopoverPopup>
      </Popover>
    </div>
  );
}
