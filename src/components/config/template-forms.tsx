"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createTemplate,
  setTemplateStatus,
  updateTemplateDetails,
  type ConfigActionResult,
} from "@/app/(workspace)/app/settings/configuration/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorClass, helperClass } from "@/lib/ui";

function Outcome({ result }: { result: ConfigActionResult | null }) {
  if (!result) return null;
  if (!result.ok) return <p className={errorClass}>{result.error}</p>;
  return result.message ? <p className={helperClass}>{result.message}</p> : null;
}

function slugFrom(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function CreateTemplateForm({
  templates,
  workspaces,
}: {
  templates: Array<{ id: string; name: string }>;
  workspaces: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("blank");
  const [result, setResult] = useState<ConfigActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const [kind, id] = source.split(":");
      const outcome = await createTemplate({
        name,
        slug: slug || slugFrom(name),
        description,
        fromTemplateId: kind === "template" ? id : null,
        fromOrgId: kind === "workspace" ? id : null,
      });
      setResult(outcome);
      if (outcome.ok && outcome.id) router.push(`/app/team/templates/${outcome.id}`);
    });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" name="name" htmlFor="tpl-name">
          <Input id="tpl-name" value={name} placeholder="Dental practices" onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Short name for links" name="slug" htmlFor="tpl-slug">
          <Input id="tpl-slug" value={slug} placeholder={slugFrom(name) || "dental"} onChange={(event) => setSlug(event.target.value)} />
        </Field>
      </div>
      <Field label="Who it is for" name="description" htmlFor="tpl-description">
        <Textarea id="tpl-description" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <Field label="Start from" name="source" htmlFor="tpl-source">
        <Select
          id="tpl-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          options={[
            { value: "blank", label: "Blank (platform defaults only)" },
            ...templates.map((template) => ({ value: `template:${template.id}`, label: `Copy of ${template.name}` })),
            ...workspaces.map((workspace) => ({ value: `workspace:${workspace.id}`, label: `From workspace: ${workspace.name}` })),
          ]}
        />
      </Field>
      <Button type="button" size="sm" variant="primary" disabled={pending || name.trim().length < 2} onClick={submit}>
        Create draft
      </Button>
      <p className={helperClass}>New templates start as drafts. A Platform Admin activates them once they are complete.</p>
      <Outcome result={result} />
    </div>
  );
}

export function TemplateDetailsForm({ templateId, name, description, canEdit }: { templateId: string; name: string; description: string; canEdit: boolean }) {
  const router = useRouter();
  const [draftName, setName] = useState(name);
  const [draftDescription, setDescription] = useState(description);
  const [result, setResult] = useState<ConfigActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <Field label="Name" name="name" htmlFor="tpl-detail-name">
        <Input id="tpl-detail-name" value={draftName} disabled={!canEdit} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Who it is for" name="description" htmlFor="tpl-detail-description">
        <Textarea id="tpl-detail-description" rows={2} value={draftDescription} disabled={!canEdit} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      {canEdit ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const outcome = await updateTemplateDetails(templateId, draftName, draftDescription);
              setResult(outcome);
              if (outcome.ok) router.refresh();
            })
          }
        >
          Save details
        </Button>
      ) : null}
      <Outcome result={result} />
    </div>
  );
}

export function TemplateStatusControl({ templateId, status }: { templateId: string; status: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ConfigActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const change = (next: "draft" | "active" | "retired") =>
    startTransition(async () => {
      const outcome = await setTemplateStatus(templateId, next, note);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  return (
    <div className="space-y-2">
      <Input density="compact" className="max-w-md" placeholder="Note (optional)" value={note} onChange={(event) => setNote(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        {status !== "active" ? (
          <Button type="button" size="sm" variant="primary" disabled={pending} onClick={() => change("active")}>
            Activate
          </Button>
        ) : null}
        {status === "active" ? (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => change("retired")}>
            Retire
          </Button>
        ) : null}
        {status !== "draft" ? (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => change("draft")}>
            Back to draft
          </Button>
        ) : null}
      </div>
      <p className={helperClass}>Only complete templates can be activated. Retiring keeps every workspace on it working; it just cannot be chosen for new ones.</p>
      <Outcome result={result} />
    </div>
  );
}
