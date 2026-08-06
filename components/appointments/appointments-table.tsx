"use client";

import { useState } from "react";

import { AppointmentDetail } from "@/components/appointments/appointment-detail";
import { StatusPill, WindowPill } from "@/components/appointments/status-pill";
import type { AppointmentRow } from "@/components/appointments/types";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TonePill } from "@/components/ui/tone";
import { formatDateTime, formatMoney } from "@/lib/format";

const HEAD_CLASS =
  "h-11 px-4 text-[10px] font-semibold tracking-[0.14em] text-dim uppercase";

const DASH = "\u2014";

export function AppointmentsTable({ rows }: { rows: AppointmentRow[] }) {
  const [selected, setSelected] = useState<AppointmentRow | null>(null);

  return (
    <>
      <div className="panel overflow-x-auto rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-secondary hover:bg-secondary">
              <TableHead className={HEAD_CLASS}>Scheduled</TableHead>
              <TableHead className={HEAD_CLASS}>Client</TableHead>
              <TableHead className={HEAD_CLASS}>Lead</TableHead>
              <TableHead className={HEAD_CLASS}>Status</TableHead>
              <TableHead className={HEAD_CLASS}>Definition</TableHead>
              <TableHead className={HEAD_CLASS}>Review window</TableHead>
              <TableHead className={`${HEAD_CLASS} text-right`}>Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((appointment) => (
              <TableRow
                key={appointment.id}
                role="button"
                tabIndex={0}
                aria-label={`Open the appointment for ${appointment.lead?.name ?? "an unnamed lead"}`}
                onClick={() => setSelected(appointment)}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                    keyEvent.preventDefault();
                    setSelected(appointment);
                  }
                }}
                className="cursor-pointer border-border/60 hover:bg-white/[0.02] focus-visible:bg-white/[0.03] focus-visible:outline-none"
              >
                <TableCell className="px-4 py-3.5 whitespace-nowrap text-silver tabular-nums">
                  {formatDateTime(appointment.scheduledFor)}
                  {appointment.rescheduleCount > 0 ? (
                    <span className="ml-2 text-xs text-dim">rescheduled</span>
                  ) : null}
                </TableCell>
                <TableCell className="px-4 py-3.5 text-silver">
                  {appointment.clientName}
                </TableCell>
                <TableCell className="px-4 py-3.5 font-medium text-white">
                  {appointment.lead?.name ?? "Unnamed"}
                  {appointment.lead?.phone ? (
                    <span className="block text-xs text-dim tabular-nums">
                      {appointment.lead.phone}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="px-4 py-3.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <StatusPill status={appointment.status} />
                    {appointment.awaitingOutcome && appointment.status === "pending" ? (
                      <TonePill tone="neutral">Awaiting outcome</TonePill>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3.5 text-silver tabular-nums">
                  v{appointment.definitionVersion}
                </TableCell>
                <TableCell className="px-4 py-3.5">
                  <WindowPill appointment={appointment} />
                </TableCell>
                <TableCell className="px-4 py-3.5 text-right text-silver tabular-nums">
                  {appointment.rate !== null
                    ? formatMoney(appointment.rate)
                    : appointment.currentRate !== null
                      ? formatMoney(appointment.currentRate)
                      : DASH}
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
          {selected ? <AppointmentDetail appointment={selected} /> : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
