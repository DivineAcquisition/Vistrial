"use client";

import { useState, type FormEvent } from "react";

import { applyForSalesOperator } from "@/app/(marketing)/hiring/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ApplyForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await applyForSalesOperator(new FormData(event.currentTarget));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return <p>Application received. The team will be in touch.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="fullName">Name</FieldLabel>
        <Input id="fullName" name="fullName" required autoComplete="name" />
      </Field>
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field>
        <FieldLabel htmlFor="phone">Phone</FieldLabel>
        <Input id="phone" name="phone" autoComplete="tel" />
      </Field>
      <Field>
        <FieldLabel htmlFor="timezone">Time zone</FieldLabel>
        <Input id="timezone" name="timezone" placeholder="America/New_York" />
      </Field>
      <Field>
        <FieldLabel htmlFor="availability">Days and hours you can work</FieldLabel>
        <Textarea id="availability" name="availability" rows={3} />
      </Field>
      <Field>
        <FieldLabel htmlFor="note">Anything else</FieldLabel>
        <Textarea id="note" name="note" rows={3} />
      </Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" variant="primary" loading={pending} loadingLabel="Sending">
        Apply
      </Button>
    </form>
  );
}
