"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export type ExportRow = {
  id: string;
  label: string;
  status: "queued" | "running" | "ready" | "failed";
  created_at: string;
  expires_at: string;
  error: string | null;
};

const STATUS: Record<ExportRow["status"], string> = {
  queued: "Waiting to start",
  running: "Building",
  ready: "Ready",
  failed: "Did not finish",
};

/** Recent exports. Checks back every few seconds while one is still being built. */
export function ExportsList({ rows, timeZone }: { rows: ExportRow[]; timeZone: string }) {
  const router = useRouter();
  const waiting = rows.some((row) => row.status === "queued" || row.status === "running");
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [router, waiting]);

  if (!rows.length) return null;
  return (
    <section id="exports" aria-labelledby="results-exports" className="flex flex-col gap-2">
      <h2 id="results-exports" className="font-heading text-base text-card-foreground">
        Your exports
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card" aria-live="polite">
        {rows.map((row) => {
          const expired = Date.parse(row.expires_at) < Date.now();
          return (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-card-foreground">{row.label}</span>
                <span className="block text-xs text-muted-foreground">
                  Asked{" "}
                  {new Date(row.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone,
                  })}
                  {row.status === "failed" && row.error ? ` · ${row.error}` : ""}
                </span>
              </span>
              {row.status === "ready" && !expired ? (
                <a
                  href={`/app/results/exports/${row.id}`}
                  className="font-medium text-brand-300 underline-offset-4 hover:underline"
                >
                  Download
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">{expired ? "Expired" : STATUS[row.status]}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
