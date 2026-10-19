"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Sheet, SheetPopup, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetTrigger } from "@/components/ui/sheet";

export function LeadPeek({
  name,
  summary,
  nextStep,
  caseHref,
}: {
  name: string;
  summary: string;
  nextStep: string;
  caseHref: string;
}) {
  return (
    <Sheet>
      <SheetTrigger className="text-left text-base font-medium text-card-foreground underline-offset-2 hover:underline">
        {name}
      </SheetTrigger>
      <SheetPopup side="right" className="max-sm:max-w-none">
        <SheetHeader>
          <SheetTitle>{name}</SheetTitle>
          <SheetDescription>{summary}</SheetDescription>
        </SheetHeader>
        <SheetPanel className="flex flex-col gap-4">
          <p className="text-sm text-card-foreground">{nextStep}</p>
          <p className="text-sm text-muted-foreground">Why first? shows here when lead order explains itself.</p>
          <p className="text-sm text-muted-foreground">Touches list who, when, the channel, and the outcome. Inbound message text is not shown.</p>
          <Button variant="primary" render={<Link href={caseHref} />}>
            Open the case file
          </Button>
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}
