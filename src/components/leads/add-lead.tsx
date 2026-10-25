"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { useConvexReady } from "@/components/providers/convex-ready";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function AddLead() {
  const ready = useConvexReady();
  const shell = useWorkspaceShell();
  if (!ready || !shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  return <LiveAdd workspaceId={shell.workspaceId} />;
}

function LiveAdd({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const create = useMutation(api.leads.create);
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="mx-auto grid w-full min-w-0 max-w-xl gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        void create({ workspaceId, displayName: name, email, phone })
          .then((leadId) => router.push(`/app/leads/${leadId}`))
          .catch((reason: Error) => setError(reason.message || "We could not add that lead."));
      }}
    >
      <PageHeader eyebrow="Leads" title="Add a lead" description="By hand. Nothing is sent." />
      <Field label="Name" name="lead-name">
        <Input id="lead-name" name="lead-name" type="text" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Email" name="lead-email">
        <Input id="lead-email" name="lead-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </Field>
      <Field label="Phone" name="lead-phone">
        <Input id="lead-phone" name="lead-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
      </Field>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit">Add lead</Button>
    </form>
  );
}
