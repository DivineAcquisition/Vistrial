"use client";

import { useQuery } from "convex/react";
import {
  ArrowRight,
  BriefcaseBusiness,
  FileSpreadsheet,
  Store,
  type LucideIcon,
} from "@/components/icons";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { MetaLogo } from "@/components/connections/meta-logo";
import { PlatformLogo } from "@/components/marketing/platform-logo";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { api } from "../../../../../convex/_generated/api";

type Tone = "good" | "warning" | "neutral";

function Card({
  icon,
  title,
  kind,
  words,
  status,
  href,
  action,
  dim,
}: {
  icon: React.ReactNode;
  title: string;
  kind: string;
  words: string;
  status: { label: string; tone: Tone };
  href?: string;
  action?: string;
  dim?: boolean;
}) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
            {icon}
          </span>
          <span className="grid">
            <span className="font-medium text-card-foreground">{title}</span>
            <span className="text-xs text-muted-foreground">{kind}</span>
          </span>
        </span>
        <StatusBadge
          label={status.label}
          tone={status.tone}
          className="shrink-0 [&_span]:normal-case"
        />
      </span>
      <span className="text-sm text-muted-foreground">{words}</span>
      {action ? (
        <span className="mt-auto flex items-center gap-1 text-sm text-primary">
          {action} <ArrowRight aria-hidden className="size-3.5" />
        </span>
      ) : null}
    </>
  );
  const className = cn(
    "grid min-h-40 content-start gap-3 rounded-2xl border border-border bg-card p-4",
    href && "transition-colors hover:border-primary/40",
    dim && "opacity-70",
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

const icon = (Icon: LucideIcon) => (
  <Icon aria-hidden className="size-4 text-muted-foreground" />
);

/**
 * The workspace's connections: accounts you log in to, and the ones coming next. Research sources are not
 * connections; they are chosen per conversation under "Where to look". This is the only place a connection is made, changed or removed;
 * agents' folders show what they are granted.
 */
export function ConnectionsScreen() {
  const shell = useWorkspaceShell();
  const params = useSearchParams();
  const router = useRouter();
  const meta = useQuery(
    api.metaAds.status,
    shell ? { workspaceId: shell.workspaceId } : "skip",
  );
  const uploads = useQuery(
    api.resultUploads.list,
    shell ? { workspaceId: shell.workspaceId } : "skip",
  );
  const returned = params.get("meta");

  // Facebook Login comes back here; carry the outcome to the Meta page.
  useEffect(() => {
    if (returned)
      router.replace(
        `/app/connections/meta?meta=${encodeURIComponent(returned)}`,
      );
  }, [returned, router]);

  if (!shell)
    return (
      <EmptyState kind="permission" title="Sign in to open your workspace." />
    );
  const conn = meta?.connection ?? null;
  const metaStatus: { label: string; tone: Tone } = !conn
    ? { label: "Not connected", tone: "neutral" }
    : conn.status === "connected"
      ? { label: "Connected", tone: "good" }
      : { label: "Reconnect needed", tone: "warning" };
  const readyFiles = (uploads ?? []).filter(
    (row) => row.status === "ready",
  ).length;
  const live = shell.agents.filter((agent) => agent.status === "live");
  const usedBy = conn
    ? live
        .filter((agent) => conn.agents.includes(agent.slug))
        .map((agent) => agent.name)
    : [];

  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-8">
      <PageHeader
        eyebrow="Workspace"
        title="Connections"
        description="Connect your accounts once, here. Agents use only the connections you grant them, and everything is read-only: nothing is posted, published or spent."
      />

      <section className="grid gap-3" aria-label="Your accounts">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Your accounts
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            icon={<MetaLogo className="h-4" />}
            title="Meta ads"
            kind="Facebook and Instagram ad results"
            words={
              conn
                ? `${conn.adAccountName ?? "No ad account chosen yet"} · connected as ${conn.metaUserName}. Used by ${usedBy.length ? usedBy.join(", ") : "no agent yet"}.`
                : "Your own campaign results, read-only, cited in research as your data."
            }
            status={metaStatus}
            href="/app/connections/meta"
            action={conn ? "Manage" : "Connect"}
          />
          <Card
            icon={icon(FileSpreadsheet)}
            title="Results files"
            kind="Exports from your other tools"
            words={
              readyFiles > 0
                ? `${readyFiles} ${readyFiles === 1 ? "file" : "files"} with totals kept. Google Ads, your CRM, bookings or email.`
                : "Upload a CSV from Google Ads, your CRM, bookings or email. Only totals are kept, cited in research as your data."
            }
            status={
              readyFiles > 0
                ? { label: "In use", tone: "good" }
                : { label: "No files", tone: "neutral" }
            }
            href="/app/connections/results"
            action={readyFiles > 0 ? "Manage" : "Upload"}
          />
        </div>
      </section>

      <section className="grid gap-3" aria-label="Coming soon">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Coming soon
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            dim
            icon={icon(Store)}
            title="Google Business Profile"
            kind="Your listing"
            words="Reviews, calls and direction requests: how local customers find you."
            status={{ label: "Coming soon", tone: "neutral" }}
          />
          <Card
            dim
            icon={icon(BriefcaseBusiness)}
            title="Jobber"
            kind="Jobs and revenue"
            words="Which leads became booked jobs, so cost per lead becomes cost per job."
            status={{ label: "Coming soon", tone: "neutral" }}
          />
          <Card
            dim
            icon={<PlatformLogo id="google-ads" size={18} decorative />}
            title="Google Ads"
            kind="Search ad results"
            words="Your search campaigns and conversions, read-only."
            status={{ label: "Coming soon", tone: "neutral" }}
          />
        </div>
      </section>
    </div>
  );
}
