"use client";

import { useState } from "react";

import { CHARGE_TONES, ChargeDetail } from "@/components/billing/charge-detail";
import { CHARGE_STATUS_LABELS, type ChargeRow } from "@/components/billing/types";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dot, TonePill } from "@/components/ui/tone";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";

const HEAD_CLASS =
  "h-11 px-4 text-[10px] font-semibold tracking-[0.14em] text-dim uppercase";

const DASH = "\u2014";

export function ChargesTable({
  rows,
  openId,
}: {
  rows: ChargeRow[];
  /** Deep link from the attention view straight to the charge that needs a person. */
  openId?: string;
}) {
  const [selected, setSelected] = useState<ChargeRow | null>(
    rows.find((row) => row.id === openId) ?? null
  );

  return (
    <>
      <div className="panel overflow-x-auto rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-secondary hover:bg-secondary">
              <TableHead className={HEAD_CLASS}>Period</TableHead>
              <TableHead className={HEAD_CLASS}>Client</TableHead>
              <TableHead className={`${HEAD_CLASS} text-right`}>Appointments</TableHead>
              <TableHead className={`${HEAD_CLASS} text-right`}>Total</TableHead>
              <TableHead className={HEAD_CLASS}>Status</TableHead>
              <TableHead className={HEAD_CLASS}>Processing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((charge) => (
              <TableRow
                key={charge.id}
                role="button"
                tabIndex={0}
                aria-label={`Open the charge for ${charge.clientName}`}
                onClick={() => setSelected(charge)}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                    keyEvent.preventDefault();
                    setSelected(charge);
                  }
                }}
                className="cursor-pointer border-border/60 hover:bg-white/[0.02] focus-visible:bg-white/[0.03] focus-visible:outline-none"
              >
                <TableCell className="px-4 py-3.5 whitespace-nowrap text-silver tabular-nums">
                  {formatDay(charge.periodStart)} to {formatDay(charge.periodEnd)}
                </TableCell>
                <TableCell className="px-4 py-3.5 font-medium text-white">
                  {charge.clientName}
                </TableCell>
                <TableCell className="px-4 py-3.5 text-right text-silver tabular-nums">
                  {charge.appointmentCount}
                  {charge.minimumAdjustment > 0 ? (
                    <span className="ml-2 text-xs text-flag-warning">+ minimum</span>
                  ) : null}
                </TableCell>
                <TableCell className="px-4 py-3.5 text-right text-white tabular-nums">
                  {formatMoney(charge.total)}
                </TableCell>
                <TableCell className="px-4 py-3.5">
                  <TonePill tone={CHARGE_TONES[charge.status]}>
                    <Dot tone={CHARGE_TONES[charge.status]} />
                    {CHARGE_STATUS_LABELS[charge.status]}
                  </TonePill>
                </TableCell>
                <TableCell className="px-4 py-3.5 text-silver tabular-nums">
                  {charge.status === "paid"
                    ? charge.processedAt
                      ? formatDateTime(charge.processedAt)
                      : DASH
                    : charge.scheduledFor
                      ? formatDateTime(charge.scheduledFor)
                      : "Not scheduled"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-border bg-popover sm:max-w-2xl"
        >
          {selected ? <ChargeDetail charge={selected} /> : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
