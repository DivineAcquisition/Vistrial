"use client";

import { useState, useTransition } from "react";
import { PartyPopper } from "lucide-react";

import { dismissLiveMessage } from "@/app/(workspace)/app/home/portal-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function LiveMessage({ name }: { name: string }) {
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  if (!open) return null;
  return (
    <Card className="items-start gap-3 border-brand-500/30 p-5 sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/12 text-brand-300">
        <PartyPopper className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-heading text-base text-card-foreground">{name} is live</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          New leads now get case files, response clocks, and drafted follow-ups. Every draft still waits for a person.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            await dismissLiveMessage();
            setOpen(false);
          })
        }
      >
        Got it
      </Button>
    </Card>
  );
}
