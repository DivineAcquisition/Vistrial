"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

import { recentLeadNames } from "@/app/(workspace)/app/home/portal-actions";
import { useOrg } from "@/components/app/org-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readRecentLeads } from "@/lib/mobile/last-lead";

/** Find a lead by name, and jump back to the ones opened last on this device. */
export function RecentLeads() {
  const { org } = useOrg();
  const [leads, setLeads] = useState<Array<{ id: string; name: string }> | null>(null);

  useEffect(() => {
    const ids = readRecentLeads(org.id);
    if (!ids.length) {
      setLeads([]);
      return;
    }
    let live = true;
    recentLeadNames(ids)
      .then((rows) => {
        if (live) setLeads(rows);
      })
      .catch(() => {
        if (live) setLeads([]);
      });
    return () => {
      live = false;
    };
  }, [org.id]);

  return (
    <section aria-labelledby="home-find" className="flex flex-col gap-3">
      <h2 id="home-find" className="font-heading text-base text-card-foreground">
        Find a lead
      </h2>
      <form action="/app/cases" method="get" role="search" className="flex gap-2">
        <label htmlFor="home-search" className="sr-only">
          Search leads by name, email, or phone
        </label>
        <Input id="home-search" name="q" type="search" placeholder="Name, email, or phone" autoComplete="off" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {leads && leads.length ? (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Opened recently on this device</p>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {leads.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/app/cases/${lead.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-card-foreground outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                >
                  <span className="min-w-0 flex-1 truncate">{lead.name}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
