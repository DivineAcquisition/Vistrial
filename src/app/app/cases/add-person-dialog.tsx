"use client";

import { useActionState } from "react";

import { createLead } from "@/app/app/cases/actions";
import { Button, SubmitButton } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { CaseActionResult } from "@/lib/cases/types";
import { errorClass } from "@/lib/ui";

const idle: CaseActionResult = { ok: true };

export function AddPersonDialog({
  triggerLabel = "Add person",
  triggerVariant = "primary",
}: {
  triggerLabel?: string;
  triggerVariant?: "primary" | "secondary";
}) {
  const [state, action, pending] = useActionState(createLead, idle);

  return (
    <Dialog>
      <DialogTrigger render={<Button variant={triggerVariant} size="sm" />}>
        {triggerLabel}
      </DialogTrigger>
      <DialogPopup>
        <form action={action}>
          <DialogHeader>
            <DialogTitle>Add person</DialogTitle>
            <DialogDescription>
              Stored in this workspace. A CRM is optional — connect one later if you want to sync
              or send.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" name="first_name" htmlFor="add-person-first" required>
                <Input
                  id="add-person-first"
                  name="first_name"
                  required
                  autoComplete="given-name"
                  placeholder="Maya"
                />
              </Field>
              <Field label="Last name" name="last_name" htmlFor="add-person-last">
                <Input
                  id="add-person-last"
                  name="last_name"
                  autoComplete="family-name"
                  placeholder="Chen"
                />
              </Field>
            </div>
            <Field label="Email" name="email" htmlFor="add-person-email">
              <Input
                id="add-person-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="maya@studio.example"
              />
            </Field>
            <Field label="Phone" name="phone" htmlFor="add-person-phone">
              <Input
                id="add-person-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="555-0100"
              />
            </Field>
            {!state.ok ? <p className={errorClass}>{state.error}</p> : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" disabled={pending} />}>Cancel</DialogClose>
            <SubmitButton pending={pending} loadingLabel="Adding">
              Add person
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
