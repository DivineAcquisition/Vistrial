"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { bodyText } from "@/lib/ui";

const ACCEPTANCE = "I accept the risk of collecting public ad library pages.";

export function DecisionsView() {
  const shell = useWorkspaceShell();
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  return <LiveDecisions shell={shell} />;
}

function LiveDecisions({ shell }: { shell: NonNullable<ReturnType<typeof useWorkspaceShell>> }) {
  const overview = useQuery(api.studio.overview, { workspaceId: shell.workspaceId });
  const mark = useMutation(api.workspace.markSetupDone);

  if (overview === undefined) return <p className="text-sm text-muted-foreground">Loading the queue.</p>;

  if (!shell.setupDone) {
    return (
      <SetupPath
        workspaceId={shell.workspaceId}
        role={shell.role}
        salesOn={shell.agents.find((agent) => agent.slug === "sales")?.state !== "off"}
        overview={overview}
      />
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6">
      <PageHeader
        eyebrow="Today"
        title="Decisions"
        description="Assets wait here until a person approves them. Nothing is posted on its own."
      />
      <Panel className="p-6">
        <h2 className="font-heading text-base text-card-foreground">Waiting on you</h2>
        {overview.waiting.length === 0 ? <p className={`${bodyText} mt-3`}>Nothing is waiting.</p> : null}
        <ul className="mt-4 grid gap-4">
          {overview.waiting.map((asset: { id: Id<"approvalAssets">; title: string; body: string; skillSlug: string }) => (
            <AssetRow key={asset.id} workspaceId={shell.workspaceId} role={shell.role} asset={asset} />
          ))}
        </ul>
        {shell.role === "owner" ? (
          <form
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault();
              void mark({ workspaceId: shell.workspaceId, setupDone: false });
            }}
          >
            <Button type="submit" variant="ghost">
              Show the setup path
            </Button>
          </form>
        ) : null}
      </Panel>
    </div>
  );
}

function SetupPath({
  workspaceId,
  role,
  salesOn,
  overview,
}: {
  workspaceId: NonNullable<ReturnType<typeof useWorkspaceShell>>["workspaceId"];
  role: "owner" | "manager" | "rep";
  salesOn: boolean;
  overview: {
    profile: {
      offer: string;
      price: string;
      audience: string;
      voice: string;
      examples: string;
      pastAds: string;
      competitors: string;
    };
    profileReady: boolean;
    swipe: { id: string; excerpt: string; sourceName: string }[];
    libraryAccepted: boolean;
  };
}) {
  const save = useMutation(api.studio.saveProfile);
  const addSwipe = useMutation(api.studio.addSwipe);
  const accept = useMutation(api.studio.acceptLibraryRisk);
  const turnOn = useMutation(api.workspace.setAgentState);
  const finish = useMutation(api.studio.completeSetup);
  const [profile, setProfile] = useState(overview.profile);
  const [excerpt, setExcerpt] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [statement, setStatement] = useState("");
  const [error, setError] = useState("");
  const canEdit = role !== "rep";

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader
        eyebrow="First sign-in"
        title="Set up the workspace"
        description="Write the business profile, connect sources, then turn on the Sales Agent. Nothing runs until you do."
      />
      <Panel className="grid gap-4 p-6">
        <h2 className="font-heading text-base text-card-foreground">1. Business profile</h2>
        <ProfileFields profile={profile} disabled={!canEdit} onChange={setProfile} />
        {canEdit ? (
          <Button
            type="button"
            onClick={() => {
              setError("");
              void save({ workspaceId, ...profile }).catch(() => setError("The profile was not saved."));
            }}
          >
            Save profile
          </Button>
        ) : (
          <p className={bodyText}>An owner or manager writes the profile.</p>
        )}
        <p className="text-xs text-muted-foreground">{overview.profileReady ? "Offer and audience are saved." : "Offer and audience are still empty."}</p>
      </Panel>
      <Panel className="grid gap-4 p-6">
        <h2 className="font-heading text-base text-card-foreground">2. Sources</h2>
        <p className={bodyText}>Own ad results are not connected. That account comes later, through the official marketing APIs.</p>
        <p className={bodyText}>Web pages and public ad libraries are collected only from public pages, with no login. The collector stays off until an Owner accepts the risk in writing.</p>
        <p className="text-sm text-muted-foreground">
          {overview.libraryAccepted ? "The Owner accepted the library risk. No live collector is running." : "Public library collection is off."}
        </p>
        {role === "owner" && !overview.libraryAccepted ? (
          <label className="grid gap-2 text-sm" htmlFor="library-acceptance">
            Type this line to accept the risk: {ACCEPTANCE}
            <Input id="library-acceptance" value={statement} onChange={(event) => setStatement(event.target.value)} />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setError("");
                void accept({ workspaceId, statement }).catch(() => setError("Collection stays off until the line matches."));
              }}
            >
              Accept the risk
            </Button>
          </label>
        ) : null}
        <h3 className="text-sm font-medium text-card-foreground">Swipe file</h3>
        <ul className="grid gap-2">
          {overview.swipe.length === 0 ? <li className="text-sm text-muted-foreground">No excerpts saved.</li> : null}
          {overview.swipe.map((row) => (
            <li key={row.id} className="text-sm text-muted-foreground">
              {row.excerpt} — {row.sourceName}
            </li>
          ))}
        </ul>
        {canEdit ? (
          <div className="grid gap-2">
            <Textarea value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="A short excerpt" />
            <Input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="Source name" />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setError("");
                void addSwipe({ workspaceId, excerpt, sourceName })
                  .then(() => {
                    setExcerpt("");
                    setSourceName("");
                  })
                  .catch(() => setError("The excerpt was not saved."));
              }}
            >
              Add excerpt
            </Button>
          </div>
        ) : null}
      </Panel>
      <Panel className="grid gap-4 p-6">
        <h2 className="font-heading text-base text-card-foreground">3. Sales Agent</h2>
        <p className={bodyText}>{salesOn ? "The Sales Agent is on. It still cannot post." : "The Sales Agent is off."}</p>
        {role === "owner" ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setError("");
              void turnOn({ workspaceId, slug: "sales", state: "on" }).catch(() => setError("The Sales Agent was not turned on."));
            }}
          >
            Turn on the Sales Agent
          </Button>
        ) : (
          <p className={bodyText}>An owner turns the Sales Agent on.</p>
        )}
        {role === "owner" ? (
          <Button
            type="button"
            onClick={() => {
              setError("");
              void finish({ workspaceId }).catch(() => setError("Save the offer and audience, and turn on the Sales Agent."));
            }}
          >
            Finish setup
          </Button>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </Panel>
    </div>
  );
}

function ProfileFields({
  profile,
  disabled,
  onChange,
}: {
  profile: {
    offer: string;
    price: string;
    audience: string;
    voice: string;
    examples: string;
    pastAds: string;
    competitors: string;
  };
  disabled: boolean;
  onChange: (next: typeof profile) => void;
}) {
  const field = (key: keyof typeof profile, label: string, long = false) => (
    <label key={key} className="grid gap-2 text-sm" htmlFor={`profile-${key}`}>
      {label}
      {long ? (
        <Textarea
          id={`profile-${key}`}
          value={profile[key]}
          disabled={disabled}
          onChange={(event) => onChange({ ...profile, [key]: event.target.value })}
        />
      ) : (
        <Input
          id={`profile-${key}`}
          value={profile[key]}
          disabled={disabled}
          onChange={(event) => onChange({ ...profile, [key]: event.target.value })}
        />
      )}
    </label>
  );
  return (
    <div className="grid gap-3">
      {field("offer", "Offer")}
      {field("price", "Price")}
      {field("audience", "Audience")}
      {field("voice", "Brand voice", true)}
      {field("examples", "Examples", true)}
      {field("pastAds", "Past ads and results", true)}
      {field("competitors", "Competitors and market", true)}
    </div>
  );
}

function AssetRow({
  workspaceId,
  role,
  asset,
}: {
  workspaceId: NonNullable<ReturnType<typeof useWorkspaceShell>>["workspaceId"];
  role: "owner" | "manager" | "rep";
  asset: { id: Id<"approvalAssets">; title: string; body: string; skillSlug: string };
}) {
  const decide = useMutation(api.studio.decideAsset);
  return (
    <li className="grid gap-3 rounded-xl border border-border p-4">
      <p className="font-medium text-card-foreground">{asset.title}</p>
      <p className="text-xs text-muted-foreground">{asset.skillSlug}</p>
      <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">{asset.body}</pre>
      {role === "rep" ? null : (
        <div className="flex gap-2">
          <Button type="button" onClick={() => void decide({ workspaceId, assetId: asset.id, status: "approved" })}>
            Approve
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void decide({ workspaceId, assetId: asset.id, status: "declined" })}
          >
            Decline
          </Button>
        </div>
      )}
    </li>
  );
}
