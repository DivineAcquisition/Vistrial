"use client";

import { ChevronLeft } from "@/components/icons";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { HighLevel } from "@/components/connections/highlevel";
import { useClientScope, useWorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { Id } from "../../../../../../convex/_generated/dataModel";

/**
 * HighLevel for the organization and each client: one sub-account each. `?client=` picks one; otherwise the
 * client picker's choice, and the organization itself when the picker shows everything.
 */
function ManageHighLevel() {
  const shell = useWorkspaceShell();
  const query = useSearchParams();
  const picked = useClientScope().clientId;
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your organization." />;
  const clients = shell.clients ?? [];
  const asked = query.get("client");
  const clientId = (asked === "own" ? undefined : clients.find((row) => row.id === asked)?.id ?? (asked ? undefined : picked)) as Id<"clients"> | undefined;
  const name = clientId ? (clients.find((row) => row.id === clientId)?.name ?? null) : null;
  const choices = [{ id: "own", name: "Your organization" }, ...clients.map((row) => ({ id: row.id as string, name: row.name }))];
  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-4">
      <Link href="/app/settings?section=data" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden className="size-4" /> Settings · Data
      </Link>
      {clients.length > 0 ? (
        <nav aria-label="Whose HighLevel" className="flex flex-wrap gap-1.5">
          {choices.map((row) => {
            const current = (clientId ?? "own") === row.id;
            return (
              <Link
                key={row.id}
                href={`/app/connections/highlevel?client=${row.id}`}
                aria-current={current ? "page" : undefined}
                className={cn("rounded-full border px-3 py-1 text-sm", current ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {row.name}
              </Link>
            );
          })}
        </nav>
      ) : null}
      <HighLevel key={clientId ?? "own"} workspaceId={shell.workspaceId} clientId={clientId} forName={name} returned={query.get("highlevel")} />
    </div>
  );
}

export default function ManageHighLevelPage() {
  return (
    <Suspense>
      <ManageHighLevel />
    </Suspense>
  );
}
