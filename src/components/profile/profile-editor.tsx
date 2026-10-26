"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Competitor = { name: string; url: string };

const empty = {
  offer: "",
  priceNotes: "",
  audience: "",
  geography: "",
  channels: "",
  brandVoice: "",
};

export function ProfileEditor({
  workspaceId,
  role,
}: {
  workspaceId: Id<"workspaces">;
  role: "owner" | "manager" | "rep";
}) {
  const profile = useQuery(api.profile.get, { workspaceId });
  const save = useMutation(api.profile.saveDraft);
  const confirm = useMutation(api.profile.confirm);
  const upload = useMutation(api.profile.createUpload);
  const addExample = useMutation(api.profile.addExample);
  const [fields, setFields] = useState(empty);
  const [ready, setReady] = useState(false);
  const [competitorName, setCompetitorName] = useState("");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [example, setExample] = useState("");
  const [error, setError] = useState("");
  const canEdit = role !== "rep";

  useEffect(() => {
    if (!profile || ready) return;
    const source = profile.draft ?? profile.confirmed;
    if (source) {
      setFields({
        offer: source.offer,
        priceNotes: source.priceNotes,
        audience: source.audience,
        geography: source.geography,
        channels: source.channels,
        brandVoice: source.brandVoice,
      });
      setCompetitors(source.competitors);
    }
    setReady(true);
  }, [profile, ready]);

  if (profile === undefined) return <p className="text-sm text-muted-foreground">Loading the profile.</p>;

  const version = profile.draft?.version;

  return (
    <div className="grid min-w-0 gap-4">
      <Panel className="grid gap-3 p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">
          {profile.confirmed ? `Confirmed version ${profile.confirmed.version}.` : "No confirmed version yet."}{" "}
          {profile.draft ? `Draft version ${profile.draft.version} is open.` : "No draft is open."}
        </p>
        {(
          [
            ["offer", "Offer"],
            ["priceNotes", "Price notes"],
            ["audience", "Audience"],
            ["geography", "Geography"],
            ["channels", "Channels"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="grid gap-2 text-sm" htmlFor={`profile-${key}`}>
            {label}
            <Input
              id={`profile-${key}`}
              value={fields[key]}
              disabled={!canEdit}
              onChange={(event) => setFields({ ...fields, [key]: event.target.value })}
            />
          </label>
        ))}
        <label className="grid gap-2 text-sm" htmlFor="profile-voice">
          Brand voice
          <Textarea
            id="profile-voice"
            value={fields.brandVoice}
            disabled={!canEdit}
            onChange={(event) => setFields({ ...fields, brandVoice: event.target.value })}
          />
        </label>
        <fieldset className="grid gap-2">
          <legend className="text-sm">Competitors</legend>
          <ul className="grid gap-1">
            {competitors.map((row) => (
              <li key={`${row.name}-${row.url}`} className="text-sm text-muted-foreground">
                {row.name} {row.url}
              </li>
            ))}
          </ul>
          {canEdit ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm" htmlFor="competitor-name">
                Name
                <Input id="competitor-name" value={competitorName} onChange={(event) => setCompetitorName(event.target.value)} />
              </label>
              <label className="grid gap-1 text-sm" htmlFor="competitor-url">
                URL
                <Input id="competitor-url" value={competitorUrl} onChange={(event) => setCompetitorUrl(event.target.value)} />
              </label>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!competitorName.trim() || !competitorUrl.trim().startsWith("https://")) {
                    setError("Each competitor needs a name and an https URL.");
                    return;
                  }
                  setCompetitors([...competitors, { name: competitorName.trim(), url: competitorUrl.trim() }]);
                  setCompetitorName("");
                  setCompetitorUrl("");
                  setError("");
                }}
              >
                Add competitor
              </Button>
            </div>
          ) : null}
        </fieldset>
        {canEdit ? (
          <Button
            type="button"
            onClick={() => {
              setError("");
              void save({ workspaceId, ...fields, competitors }).catch(() => setError("The draft was not saved."));
            }}
          >
            Save draft
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">You can read the profile. An owner or manager confirms it.</p>
        )}
        {canEdit ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setError("");
              void confirm({ workspaceId }).catch(() => setError("Confirm the draft after the offer and audience are saved."));
            }}
          >
            Confirm profile
          </Button>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </Panel>
      {canEdit && version ? (
        <Panel className="grid gap-3 p-4 sm:p-6">
          <h2 className="font-heading text-base text-card-foreground">Examples</h2>
          <label className="grid gap-2 text-sm" htmlFor="example-text">
            Short example
            <Textarea id="example-text" value={example} onChange={(event) => setExample(event.target.value)} />
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void addExample({ workspaceId, version, kind: "voiceExample", text: example }).then(() => setExample(""));
            }}
          >
            Save example
          </Button>
          <label className="grid gap-2 text-sm" htmlFor="example-file">
            Example file
            <input
              id="example-file"
              type="file"
              className="text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void upload({ workspaceId })
                  .then((url) =>
                    fetch(url, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file }),
                  )
                  .then((result) => result.json())
                  .then((json: { storageId: Id<"_storage"> }) =>
                    addExample({ workspaceId, version, kind: "pastAd", storageId: json.storageId }),
                  );
              }}
            />
          </label>
          <ul className="grid gap-1">
            {profile.examples.map((row: { id: string; kind: string; text: string; hasFile: boolean }) => (
              <li key={row.id} className="text-sm text-muted-foreground">
                {row.kind}
                {row.text ? `: ${row.text}` : ""}
                {row.hasFile ? " File saved." : ""}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Panel className="p-4 sm:p-6">
        <h2 className="font-heading text-base text-card-foreground">Versions</h2>
        <ul className="mt-3 grid gap-1">
          {profile.versions.map((row: { version: number; status: string }) => (
            <li key={row.version} className="text-sm text-muted-foreground">
              Version {row.version}: {row.status === "confirmed" ? "Confirmed" : "Draft"}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
