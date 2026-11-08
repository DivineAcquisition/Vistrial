"use client";

import { useQuery } from "convex/react";
import { ArrowRight, BriefcaseBusiness, Camera, Globe, Megaphone, Music2, PlaySquare, Search, Store, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { MetaLogo } from "@/components/connections/meta-logo";
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
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background">{icon}</span>
          <span className="grid">
            <span className="font-medium text-card-foreground">{title}</span>
            <span className="text-xs text-muted-foreground">{kind}</span>
          </span>
        </span>
        <StatusBadge label={status.label} tone={status.tone} className="shrink-0 [&_span]:normal-case" />
      </span>
      <span className="text-sm text-muted-foreground">{words}</span>
      {action ? (
        <span className="mt-auto flex items-center gap-1 text-sm text-primary">
          {action} <ArrowRight aria-hidden className="size-3.5" />
        </span>
      ) : null}
    </>
  );
  const className = cn("grid min-h-40 content-start gap-3 rounded-2xl border border-border bg-card p-4", href && "transition-colors hover:border-primary/40", dim && "opacity-70");
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

const icon = (Icon: LucideIcon) => <Icon aria-hidden className="size-4 text-muted-foreground" />;

/**
 * The workspace's connections, like a connector directory: what is connected and managed here, the research
 * sources agents read, and what comes next. This is the only place a connection is made, changed or removed;
 * agents' folders show what they are granted.
 */
export function ConnectionsScreen() {
  const shell = useWorkspaceShell();
  const params = useSearchParams();
  const router = useRouter();
  const meta = useQuery(api.metaAds.status, shell ? { workspaceId: shell.workspaceId } : "skip");
  const sources = useQuery(api.agentFolder.tree, shell ? { workspaceId: shell.workspaceId, agentSlug: "growth-architect", limit: 1 } : "skip");
  const returned = params.get("meta");

  // Facebook Login comes back here; carry the outcome to the Meta page.
  useEffect(() => {
    if (returned) router.replace(`/app/connections/meta?meta=${encodeURIComponent(returned)}`);
  }, [returned, router]);

  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  const conn = meta?.connection ?? null;
  const metaStatus: { label: string; tone: Tone } = !conn ? { label: "Not connected", tone: "neutral" } : conn.status === "connected" ? { label: "Connected", tone: "good" } : { label: "Reconnect needed", tone: "warning" };
  const live = shell.agents.filter((agent) => agent.status === "live");
  const usedBy = conn ? live.filter((agent) => conn.agents.includes(agent.slug)).map((agent) => agent.name) : [];
  const source = (key: string) => sources?.connections.find((row) => row.key === key)?.state ?? "off";
  const sourceStatus = (state: string, detail?: string): { label: string; tone: Tone } =>
    state === "on" ? { label: "On", tone: "good" } : state === "attention" ? { label: detail ?? "Needs attention", tone: "warning" } : { label: "Not set up", tone: "neutral" };

  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-8">
      <PageHeader
        eyebrow="Workspace"
        title="Connections"
        description="Connect your accounts once, here. Agents use only the connections you grant them, and everything is read-only: nothing is posted, published or spent."
      />

      <section className="grid gap-3" aria-label="Your accounts">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Your accounts</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            icon={<MetaLogo className="h-4" />}
            title="Meta ads"
            kind="Facebook and Instagram ad results"
            words={conn ? `${conn.adAccountName ?? "No ad account chosen yet"} · connected as ${conn.metaUserName}. Used by ${usedBy.length ? usedBy.join(", ") : "no agent yet"}.` : "Your own campaign results, read-only, cited in research as your data."}
            status={metaStatus}
            href="/app/connections/meta"
            action={conn ? "Manage" : "Connect"}
          />
        </div>
      </section>

      <section className="grid gap-3" aria-label="Research sources">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Research sources</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card icon={icon(Search)} title="Web" kind="Search and public pages" words="Competitors' sites and public pages, through Claude's web search." status={{ label: "On", tone: "good" }} />
          <Card icon={icon(PlaySquare)} title="YouTube" kind="Official API" words="Public videos, played in YouTube's own player." status={sourceStatus(source("youtube"))} />
          <Card icon={icon(Music2)} title="TikTok" kind="Official embeds" words="Public videos found or pasted, shown with TikTok's player. No search API." status={{ label: "On", tone: "good" }} />
          <Card icon={icon(Camera)} title="Instagram" kind="Official embeds" words="Public posts you paste, once Meta approves the app's embed access." status={sourceStatus(source("instagram"), "Waiting for Meta approval")} />
          <Card icon={icon(Megaphone)} title="Meta Ad Library" kind="Public ads" words="Competitors' ads. Commercial ads are available for the EU and UK only." status={sourceStatus(source("adLibrary"), "Needs access")} />
        </div>
      </section>

      <section className="grid gap-3" aria-label="Coming soon">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Coming soon</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card dim icon={icon(Store)} title="Google Business Profile" kind="Your listing" words="Reviews, calls and direction requests: how local customers find you." status={{ label: "Coming soon", tone: "neutral" }} />
          <Card dim icon={icon(BriefcaseBusiness)} title="Jobber" kind="Jobs and revenue" words="Which leads became booked jobs, so cost per lead becomes cost per job." status={{ label: "Coming soon", tone: "neutral" }} />
          <Card dim icon={icon(Globe)} title="Google Ads" kind="Search ad results" words="Your search campaigns and conversions, read-only." status={{ label: "Coming soon", tone: "neutral" }} />
        </div>
      </section>
    </div>
  );
}
