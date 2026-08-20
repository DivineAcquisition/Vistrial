"use client";

import Link from "next/link";
import { useState } from "react";

import { refreshCallList } from "@/app/app/calls/actions";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCallDuration } from "@/lib/cases/format";
import { CALL_PAGE_SIZE, type CallListPayload, type CallListRow } from "@/lib/calls/types";
import {
  CALL_OUTCOME_LABELS,
  CALL_TYPE_LABELS,
  EXTRACTION_STATUS_LABELS,
} from "@/lib/leads/labels";
import { formatQueueDuration } from "@/lib/queue/duration";
import { btnPrimary, btnSecondary, btnSizeSm } from "@/lib/ui";

export function CallsScreen({
  initial,
  canOpenIntegrations,
}: {
  initial: CallListPayload;
  canOpenIntegrations: boolean;
}) {
  const [rows, setRows] = useState(initial.rows);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [now] = useState(() => new Date().toISOString());

  const integrations = canOpenIntegrations ? (
    <Link href="/app/settings/integrations" className={`${btnSecondary} ${btnSizeSm}`}>
      Open integrations
    </Link>
  ) : null;

  if (initial.orgCallCount === 0) {
    if (initial.crmStatus === "broken") {
      return (
        <EmptyState
          kind="unconfigured"
          title="Calls cannot load while the CRM connection is broken"
          detail="Appointments will not sync until GoHighLevel is reconnected. This is not an empty call list."
          action={integrations}
        />
      );
    }
    if (initial.crmStatus === "missing" || initial.crmStatus === "inactive") {
      return (
        <EmptyState
          kind="unconfigured"
          title="Calls appear after capture is connected"
          detail="Booked and completed calls list here once the CRM and transcript sources are linked."
          action={integrations}
        />
      );
    }
    return (
      <EmptyState
        title="No calls yet"
        detail="GoHighLevel is connected. Booked appointments will list here after they ingest."
      />
    );
  }

  async function loadMore() {
    const last = rows[rows.length - 1];
    if (!last || !hasMore) return;
    setLoadingMore(true);
    try {
      const payload = await refreshCallList({
        cursor: {
          at: last.occurredAt ?? last.scheduledAt ?? new Date().toISOString(),
          id: last.id,
        },
      });
      const incoming = payload.rows.filter((row) => !rows.some((existing) => existing.id === row.id));
      setRows((current) => [...current, ...incoming]);
      setHasMore(payload.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-secondary hover:bg-secondary">
              {["Lead", "Type", "When", "Outcome", "Extraction", ""].map((label) => (
                <TableHead
                  key={label}
                  className="h-11 px-4 text-[10px] font-semibold tracking-[0.14em] text-secondary-foreground uppercase"
                >
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <CallRow key={row.id} row={row} now={now} />
            ))}
          </TableBody>
        </Table>
      </div>
      {hasMore ? (
        <button
          type="button"
          className={`${btnSecondary} ${btnSizeSm}`}
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}

function CallRow({ row, now }: { row: CallListRow; now: string }) {
  return (
    <TableRow className="border-border/60">
      <TableCell className="px-4 py-3.5 font-medium text-white">{row.leadName}</TableCell>
      <TableCell className="px-4 py-3.5 text-silver">{CALL_TYPE_LABELS[row.type]}</TableCell>
      <TableCell className="px-4 py-3.5 text-silver tabular-nums">
        {formatQueueDuration(row.occurredAt ?? row.scheduledAt, now)}
        <span className="mt-1 block text-xs text-dim">{formatCallDuration(row.durationSeconds)}</span>
      </TableCell>
      <TableCell className="px-4 py-3.5 text-silver">
        {row.outcome ? CALL_OUTCOME_LABELS[row.outcome] : "—"}
      </TableCell>
      <TableCell className="px-4 py-3.5">
        <StatusBadge
          label={EXTRACTION_STATUS_LABELS[row.extractionStatus]}
          tone={row.extractionStatus === "failed" ? "critical" : row.extractionStatus === "ready" ? "good" : "neutral"}
        />
      </TableCell>
      <TableCell className="px-4 py-3.5">
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/calls/${row.id}`} className={`${btnSecondary} ${btnSizeSm}`}>
            Open
          </Link>
          <Link href={`/app/cases/${row.leadId}/brief`} className={`${btnPrimary} ${btnSizeSm}`}>
            Brief
          </Link>
        </div>
      </TableCell>
    </TableRow>
  );
}

void CALL_PAGE_SIZE;
