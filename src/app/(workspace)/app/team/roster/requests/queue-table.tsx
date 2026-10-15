"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { bulkRequestStatus } from "@/app/(workspace)/app/team/roster/requests/actions";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { checkboxClass, errorClass, helperClass, selectClass } from "@/lib/ui";

export type QueueRow = {
  id: string;
  kind: string;
  name: string;
  business: string;
  industry: string;
  team: string;
  crm: string;
  leads: string;
  status: string;
  age: string;
  owner: string;
  activity: string;
  stale: boolean;
};

const STATUSES = [
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "declined", label: "Declined" },
  { value: "archived", label: "Archived" },
  { value: "waiting", label: "Waiting on requester" },
  { value: "answered", label: "Answered" },
  { value: "closed", label: "Closed" },
];

export function RequestQueue({ rows, admin }: { rows: QueueRow[]; admin: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [status, setStatus] = useState("in_review");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="space-y-4">
      {admin && picked.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 p-3">
          <p className="text-sm text-white">{picked.length} selected</p>
          <select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status for the selected requests">
            {STATUSES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => {
              const label = STATUSES.find((item) => item.value === status)?.label ?? status;
              if (!window.confirm(`Change ${picked.length} requests to ${label}?`)) return;
              start(async () => {
                const result = await bulkRequestStatus(picked, status);
                if (!result.ok) setError(result.error);
                else {
                  setError(null);
                  setMessage(result.message ?? "Updated.");
                  setPicked([]);
                }
              });
            }}
          >
            Apply
          </Button>
        </div>
      ) : null}
      {error ? <p className={errorClass}>{error}</p> : null}
      {message ? <p className={helperClass}>{message}</p> : null}
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-white/10 p-4">
            <div className="flex items-start gap-3">
              {admin ? (
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={picked.includes(row.id)}
                  onChange={() => toggle(row.id)}
                  aria-label={`Select ${row.business}`}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <Link href={`/app/team/roster/requests/${row.id}`} className="font-medium text-white">
                  {row.business}
                </Link>
                <p className="text-sm text-silver">
                  {row.name} · {row.kind} · {row.industry}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.team} · {row.crm} · {row.leads} · {row.age} · {row.owner} · {row.activity}
                  {row.stale ? " · waiting" : ""}
                </p>
              </div>
              <StatusBadge label={row.status} tone={row.stale ? "warning" : "neutral"} />
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className={helperClass}>No requests match.</p> : null}
    </div>
  );
}
