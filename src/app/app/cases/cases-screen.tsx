"use client";

import Link from "next/link";
import { useState } from "react";

import { CasesFilters } from "@/app/app/cases/cases-filters";
import { refreshCaseList } from "@/app/app/cases/actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cursorFromCaseRow } from "@/lib/cases/cursor";
import { caseListEmptyKind } from "@/lib/cases/parse";
import {
  CASE_PAGE_SIZE,
  type CaseListFilters,
  type CaseListPayload,
  type CaseListRow,
} from "@/lib/cases/types";
import { LEAD_STATUS_LABELS, LEAD_TRACK_LABELS, leadStatusTone } from "@/lib/leads/labels";
import { formatQueueDuration } from "@/lib/queue/duration";

/**
 * On a narrow screen the last three columns fold away rather than pushing the
 * table into a sideways scroll. Name, score and status are what a phone is for.
 */
const COLUMNS: Array<{ label: string; hideOnMobile?: boolean }> = [
  { label: "Lead" },
  { label: "Score" },
  { label: "Status" },
  { label: "Source", hideOnMobile: true },
  { label: "Assigned", hideOnMobile: true },
  { label: "Last touch", hideOnMobile: true },
];

export function CasesScreen({
  initial,
  filters,
  canOpenIntegrations,
}: {
  initial: CaseListPayload;
  filters: CaseListFilters;
  canOpenIntegrations: boolean;
}) {
  const [rows, setRows] = useState(initial.rows);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [now] = useState(() => new Date().toISOString());

  const emptyKind = caseListEmptyKind({ ...initial, rows, hasMore }, filters);
  const connectionBanner =
    initial.orgLeadCount > 0 &&
    (initial.crmStatus === "broken" || initial.crmStatus === "missing" || initial.crmStatus === "inactive")
      ? initial.crmStatus === "broken"
        ? "broken"
        : "not_connected"
      : null;

  const integrations = canOpenIntegrations ? (
    <Button variant="secondary" size="sm" render={<Link href="/app/settings/integrations" />}>
      Open integrations
    </Button>
  ) : null;

  const showList = emptyKind === null || emptyKind === "no_results";

  async function loadMore() {
    const last = rows[rows.length - 1];
    if (!last || !hasMore) return;
    setLoadingMore(true);
    try {
      const payload = await refreshCaseList(filters, {
        cursor: cursorFromCaseRow(last, filters.sort),
        limit: CASE_PAGE_SIZE,
      });
      const incoming = payload.rows.filter((row) => !rows.some((existing) => existing.id === row.id));
      setRows((current) => [...current, ...incoming]);
      setHasMore(payload.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      {connectionBanner === "broken" ? (
        <div className="mb-8">
          <EmptyState
            kind="unconfigured"
            title="The CRM connection is broken"
            detail="LeadConnector is linked but token refresh failed. Reconnect in Integrations. Existing case files stay on this screen so the outage is not hidden."
            action={integrations}
          />
        </div>
      ) : null}

      {connectionBanner === "not_connected" ? (
        <div className="mb-8">
          <EmptyState
            kind="unconfigured"
            title="The CRM is not connected"
            detail="New inbound will not land until LeadConnector is linked. Leads already in this workspace are still listed below."
            action={integrations}
          />
        </div>
      ) : null}

      {emptyKind === "not_connected" ? (
        <EmptyState
          kind="unconfigured"
          title="Case files appear after the CRM is connected"
          detail="Each inbound lead will get a case file here. That list stays empty until LeadConnector sync is turned on."
          action={integrations}
        />
      ) : null}

      {emptyKind === "broken" ? (
        <EmptyState
          kind="unconfigured"
          title="Case files cannot load while the CRM connection is broken"
          detail="The location is linked but the connection is broken. Reconnect in Integrations. This is not an empty caseload."
          action={integrations}
        />
      ) : null}

      {emptyKind === "no_leads" ? (
        <EmptyState
          kind="empty"
          title="No case files yet"
          detail="LeadConnector is connected. Contacts will appear here after they ingest. There is nothing to open yet."
        />
      ) : null}

      {showList ? (
        <>
          <CasesFilters filters={filters} sources={initial.sources} members={initial.members} />
          {emptyKind === "no_results" ? (
            <EmptyState
              kind="empty"
              title="No case files match"
              detail="Leads exist in this workspace. Nothing matched that name, email, phone, or filter set. This is not an empty caseload."
              action={
                <Button variant="secondary" size="sm" render={<Link href="/app/cases" />}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <>
              <Card className="overflow-hidden py-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {COLUMNS.map((column) => (
                        <TableHead
                          key={column.label}
                          className={column.hideOnMobile ? "hidden md:table-cell" : undefined}
                        >
                          {column.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="app-stagger">
                    {rows.map((row) => (
                      <CaseRow key={row.id} row={row} now={now} />
                    ))}
                  </TableBody>
                </Table>
              </Card>
              {hasMore ? (
                <div className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function CaseRow({ row, now }: { row: CaseListRow; now: string }) {
  const trackLabel = row.leadType ? LEAD_TRACK_LABELS[row.leadType] : null;
  const assigned = [row.assignedSetterName, row.assignedCloserName].filter(Boolean).join(" / ") || "—";

  return (
    <TableRow className="relative border-border/60 hover:bg-white/[0.02]">
      <TableCell className="px-4 py-3.5 font-medium whitespace-normal text-white">
        <Link href={`/app/cases/${row.id}`} className="after:absolute after:inset-0">
          {row.name}
        </Link>
        {row.email ? <span className="mt-1 block text-xs text-dim">{row.email}</span> : null}
        <span className="mt-1 block text-xs text-dim md:hidden">
          {[row.source || null, assigned === "—" ? null : assigned]
            .filter(Boolean)
            .join(" · ") || "No source recorded"}
        </span>
      </TableCell>
      <TableCell className="px-4 py-3.5 whitespace-normal">
        {row.score === null ? (
          <StatusBadge label="Unscored" tone="warning" />
        ) : (
          <span>
            <span className="font-medium text-white tabular-nums">{row.score}</span>
            {trackLabel ? (
              <span className="ml-2">
                <StatusBadge
                  label={trackLabel}
                  tone={row.leadType === "ready_track" ? "brand" : "neutral"}
                />
              </span>
            ) : null}
          </span>
        )}
      </TableCell>
      <TableCell className="px-4 py-3.5 whitespace-normal">
        <StatusBadge label={LEAD_STATUS_LABELS[row.status]} tone={leadStatusTone(row.status)} />
      </TableCell>
      <TableCell className="hidden px-4 py-3.5 text-silver md:table-cell">{row.source || "—"}</TableCell>
      <TableCell className="hidden px-4 py-3.5 text-silver whitespace-normal md:table-cell">{assigned}</TableCell>
      <TableCell className="hidden px-4 py-3.5 text-silver tabular-nums md:table-cell">
        {formatQueueDuration(row.lastTouchAt, now)}
      </TableCell>
    </TableRow>
  );
}
