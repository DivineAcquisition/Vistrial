"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORMS, PLATFORM_LABEL, type PlatformSlug } from "@/lib/research/words";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SourceIcon } from "@/components/research/source-icon";
import { showError } from "@/lib/errors/show-error";
import { useCredits } from "@/lib/credits";

type Competitor = { name: string; url: string };

/**
 * A new Market Intelligence assignment. The person states the objective and the scope; the form shows,
 * before anything runs, what each source can and cannot see here and what the run can cost.
 */
export function AssignmentForm({
  workspaceId,
  canStart,
  initialObjective = "",
}: {
  workspaceId: Id<"workspaces">;
  canStart: boolean;
  /** A follow-up from a session's composer, or a suggestion the person picked. */
  initialObjective?: string;
}) {
  const credits = useCredits();
  const router = useRouter();
  const createProject = useMutation(api.research.createProject);
  const start = useMutation(api.runs.start);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState(initialObjective);
  const [market, setMarket] = useState("");
  const [geography, setGeography] = useState("");
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [competitorName, setCompetitorName] = useState("");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [platforms, setPlatforms] = useState<PlatformSlug[]>(["web", "youtube", "tiktok"]);
  const [links, setLinks] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setup = useQuery(api.studio.sourceSetup, { workspaceId, geography: geography || undefined });

  const toggle = (platform: PlatformSlug, on: boolean) =>
    setPlatforms((current) => (on ? [...new Set([...current, platform])] : current.filter((row) => row !== platform)));

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const projectId = await createProject({
        workspaceId,
        title,
        objective,
        market,
        geography,
        competitors: competitors.map((row) => (row.url ? row : { name: row.name })),
        platforms,
        suppliedUrls: links
          .split(/\s+/)
          .map((row) => row.trim())
          .filter(Boolean),
      });
      await start({ workspaceId, agentSlug: "growth-architect", skillSlug: "market-intelligence", projectId });
      router.push(`/app/agents/growth-architect/sessions/${projectId}`);
    } catch (problem) {
      setError(showError(problem, "The assignment did not start. Check the fields and try again."));
      setBusy(false);
    }
  };

  const cost = setup?.cost;
  const dayLeft = cost ? Math.max(0, cost.dayCapCents - cost.daySpentCents) : null;

  return (
    <form
      className="grid min-w-0 gap-6 lg:grid-cols-[1fr_20rem]"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Panel className="grid min-w-0 gap-4 p-4 sm:p-6">
        <label className="grid gap-2 text-sm" htmlFor="mi-objective">
          What do you want to find out?
          <Textarea
            id="mi-objective"
            required
            value={objective}
            placeholder="For example: Which offers and messages do Austin deep-cleaning competitors lead with, and where can we stand out?"
            onChange={(event) => setObjective(event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm" htmlFor="mi-title">
          Name this assignment
          <Input id="mi-title" required value={title} placeholder="Austin deep cleaning" onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm" htmlFor="mi-market">
            Market
            <Input id="mi-market" value={market} placeholder="Deep house cleaning" onChange={(event) => setMarket(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm" htmlFor="mi-geo">
            Area
            <Input id="mi-geo" value={geography} placeholder="Austin, TX" onChange={(event) => setGeography(event.target.value)} />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          Leave market or area empty and the agent uses your confirmed profile. If neither has it, the agent asks you before it researches anything.
        </p>

        <fieldset className="grid gap-2">
          <legend className="text-sm">Competitors to include</legend>
          {competitors.length > 0 ? (
            <ul className="grid gap-1">
              {competitors.map((row, index) => (
                <li key={`${row.name}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-card-foreground">{row.name}</span>
                  {row.url ? <span className="break-all text-muted-foreground">{row.url}</span> : null}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCompetitors(competitors.filter((_, i) => i !== index))}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="grid gap-1 text-sm" htmlFor="mi-comp-name">
              Name
              <Input id="mi-comp-name" value={competitorName} onChange={(event) => setCompetitorName(event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm" htmlFor="mi-comp-url">
              Website (optional)
              <Input id="mi-comp-url" value={competitorUrl} placeholder="https://" onChange={(event) => setCompetitorUrl(event.target.value)} />
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={!competitorName.trim()}
              onClick={() => {
                setCompetitors([...competitors, { name: competitorName.trim(), url: competitorUrl.trim() }]);
                setCompetitorName("");
                setCompetitorUrl("");
              }}
            >
              Add
            </Button>
          </div>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="text-sm">Where to look</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PLATFORMS.map((platform) => (
              <label key={platform} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={platforms.includes(platform)}
                  disabled={platform === "web"}
                  onCheckedChange={(checked) => toggle(platform, checked === true)}
                />
                <SourceIcon platform={platform} size={16} />
                {PLATFORM_LABEL[platform]}
                {platform === "web" ? <span className="text-muted-foreground">(always)</span> : null}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="grid gap-2 text-sm" htmlFor="mi-links">
          Links you want analyzed (one per line, optional)
          <Textarea
            id="mi-links"
            value={links}
            placeholder="https://www.tiktok.com/@competitor/video/..."
            onChange={(event) => setLinks(event.target.value)}
          />
        </label>
      </Panel>

      <aside className="grid content-start gap-4">
        <Panel className="grid gap-3 p-4">
          <h2 className="font-heading text-base text-card-foreground">What it can see here</h2>
          {setup === undefined ? <p className="text-sm text-muted-foreground">Checking sources.</p> : null}
          <ul className="grid gap-3">
            {(setup?.sources ?? [])
              .filter((row) => platforms.includes(row.platform as PlatformSlug))
              .map((row) => (
                <li key={row.platform} className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-card-foreground">{PLATFORM_LABEL[row.platform]}</span>
                    <StatusBadge label={row.state === "ready" ? "Ready" : "Limited"} tone={row.state === "ready" ? "good" : "warning"} className="[&_span]:normal-case" />
                  </div>
                  <p className="text-sm text-muted-foreground">{row.words}</p>
                </li>
              ))}
          </ul>
          <p className="text-xs text-muted-foreground">It never logs in anywhere, and it says plainly what it could not see.</p>
        </Panel>
        <Panel className="grid gap-2 p-4">
          <h2 className="font-heading text-base text-card-foreground">Cost</h2>
          {cost ? (
            <>
              <p className="text-sm text-card-foreground">
                Usually {credits.cost(cost.typicalCents[0])} to {credits.cost(cost.typicalCents[1])}. Never more than {credits.cost(cost.capCents)}.
              </p>
              <p className="text-sm text-muted-foreground">
                {credits.cost(cost.reserveCents)} of that is held back to check the report and fix it once if a check fails.
              </p>
              {dayLeft !== null ? <p className="text-sm text-muted-foreground">Left today for research: {credits.cost(dayLeft)}.</p> : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Loading.</p>
          )}
        </Panel>
        <Panel className="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            It studies first and recommends after. You get a draft report with three opportunities, each tied to the sources behind it. Nothing is published or sent.
          </p>
          {canStart ? (
            <Button type="submit" disabled={busy || !objective.trim() || !title.trim()}>
              {busy ? "Starting" : "Start research"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">An owner or manager starts research.</p>
          )}
          <p role="status" className="min-h-5 text-sm text-destructive">
            {error}
          </p>
        </Panel>
      </aside>
    </form>
  );
}
