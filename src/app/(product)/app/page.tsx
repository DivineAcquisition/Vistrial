import { Plus } from "@/components/icons";
import Link from "next/link";

import { VistrialMark } from "@/components/brand/vistrial-mark";
import { DecisionsView } from "@/components/shell/decisions-view";
import { Button } from "@/components/ui/button";

export default function DecisionsPage() {
  return (
    <div className="grid gap-8">
      <section className="flex flex-wrap items-center justify-between gap-4" aria-label="Start a session">
        <div className="flex items-center gap-3">
          <VistrialMark size="md" />
          <div>
            <h1 className="font-heading text-xl text-foreground">What should Vistrial work on?</h1>
            <p className="text-sm text-muted-foreground">Start a session and ask in your own words. It begins from what it knows about your business.</p>
          </div>
        </div>
        <Button render={<Link href="/app/agents/growth-architect/sessions/new" />}>
          <Plus aria-hidden /> New session
        </Button>
      </section>
      <DecisionsView />
    </div>
  );
}
