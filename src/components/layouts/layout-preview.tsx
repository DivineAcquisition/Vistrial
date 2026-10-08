"use client";

import Link from "next/link";

import { ApplicationShell } from "@/components/app/application-shell";
import { LayoutSample } from "@/components/layouts/layout-samples";
import { shellChrome, shellNavigation, type PageLayoutKind } from "@/lib/shell/nav";

const SAMPLE_NAME = "Harbor & Pine Consulting Group International";

export function LayoutPreview({ kind }: { kind: PageLayoutKind }) {
  const nav = shellNavigation({ role: "owner", templateAccess: false });
  const chrome = shellChrome("/app/home");
  return (
    <ApplicationShell
      groups={nav.groups}
      phone={nav.phone}
      more={nav.more}
      homeHref="/app/layouts"
      title={labelFor(kind)}
      crumbs={kind === "record" ? chrome.crumbs : []}
      version="0.1.0"
      chat={kind === "chat"}
      leading={
        <p className="max-w-[7rem] truncate text-sm text-muted-foreground sm:max-w-[16rem]" title={SAMPLE_NAME}>
          {SAMPLE_NAME}
        </p>
      }
      renderAccount={() => (
        <Link href="/app/layouts" className="rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-accent">
          Account
        </Link>
      )}
    >
      <LayoutSample kind={kind} />
    </ApplicationShell>
  );
}

function labelFor(kind: PageLayoutKind): string {
  switch (kind) {
    case "standard":
      return "Standard";
    case "dashboard":
      return "Dashboard";
    case "list-detail":
      return "List and detail";
    case "table":
      return "Table";
    case "record":
      return "Record";
    case "workflow":
      return "Workflow";
    case "chat":
      return "Chat";
    case "message":
      return "Message";
  }
}
