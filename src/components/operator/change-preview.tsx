"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { OPERATOR_WRITE_LABELS } from "@/lib/operator/labels";
import type { OperatorBatchReport, OperatorConfirmationView } from "@/lib/operator/types";
import { helperClass } from "@/lib/ui";

function reportLine(report: OperatorBatchReport): string {
  return `${report.succeeded.length} succeeded, ${report.failed.length} failed, ${report.notAttempted.length} not attempted.`;
}

export function ChangePreview({
  confirmation,
  busy = false,
  onConfirm,
  onCancel,
  onUndo,
}: {
  confirmation: OperatorConfirmationView;
  busy?: boolean;
  onConfirm?: (selectedIds: string[]) => void;
  onCancel?: () => void;
  onUndo?: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(confirmation.records.map((row) => row.id))
  );
  const pending = confirmation.decision === "pending";
  const canUndo =
    Boolean(onUndo) &&
    confirmation.reversible &&
    !confirmation.undoneAt &&
    (confirmation.decision === "confirmed" || confirmation.decision === "adjusted") &&
    confirmation.undoUntil &&
    new Date(confirmation.undoUntil).getTime() > Date.now();

  const records = confirmation.records;
  const allSelected = useMemo(
    () => records.length > 0 && records.every((row) => selected.has(row.id)),
    [records, selected]
  );

  return (
    <div className="rounded-xl border border-white/[0.1] bg-white/[0.03] p-4">
      <p className="text-sm font-medium text-white">
        {OPERATOR_WRITE_LABELS[confirmation.writeKind]} · {confirmation.recordCount} record
        {confirmation.recordCount === 1 ? "" : "s"}
      </p>
      {!confirmation.reversible ? (
        <Notice tone="warning" className="mt-3">
          {confirmation.irreversibleReason ?? "This write cannot be undone."}
        </Notice>
      ) : (
        <p className={`mt-2 ${helperClass}`}>This write can be undone for a short window after it runs.</p>
      )}

      <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-white/[0.06]">
        {pending ? (
          <label className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-xs text-dim">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) => {
                setSelected(event.target.checked ? new Set(records.map((row) => row.id)) : new Set());
              }}
            />
            All {records.length}
          </label>
        ) : null}
        <ul>
          {records.map((row) => (
            <li key={row.id} className="border-b border-white/[0.05] px-3 py-2 last:border-b-0">
              <div className="flex items-start gap-2">
                {pending ? (
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(row.id)}
                    onChange={(event) => {
                      setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(row.id);
                        else next.delete(row.id);
                        return next;
                      });
                    }}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  {row.href ? (
                    <Link href={row.href} className="text-sm text-brand-300 hover:text-white">
                      {row.label}
                    </Link>
                  ) : (
                    <p className="text-sm text-white">{row.label}</p>
                  )}
                  <dl className="mt-1 space-y-0.5">
                    {row.fields.map((field) => (
                      <div key={field.field} className="text-xs text-silver">
                        <span className="text-dim">{field.field}: </span>
                        <span>{field.before ?? "—"}</span>
                        <span className="text-dim"> → </span>
                        <span>{field.after ?? "—"}</span>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {confirmation.decision === "cancelled" ? (
        <p className={`mt-3 ${helperClass}`}>Cancelled. Nothing was changed.</p>
      ) : null}
      {confirmation.executeResult ? (
        <p className={`mt-3 ${helperClass}`}>{reportLine(confirmation.executeResult)}</p>
      ) : null}
      {confirmation.undoResult ? (
        <p className={`mt-2 ${helperClass}`}>Undo: {reportLine(confirmation.undoResult)}</p>
      ) : null}

      {pending && onConfirm && onCancel ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={busy || selected.size === 0}
            onClick={() => onConfirm([...selected])}
          >
            Confirm {selected.size}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}

      {canUndo ? (
        <div className="mt-3">
          <Button variant="outline" size="sm" disabled={busy} onClick={onUndo}>
            Undo
          </Button>
        </div>
      ) : null}
    </div>
  );
}
