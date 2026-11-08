import { VistrialMark } from "@/components/brand/vistrial-mark";
import { StartChat } from "@/components/chat/start-chat";
import { DecisionsView } from "@/components/shell/decisions-view";

export default function DecisionsPage() {
  return (
    <div className="grid gap-8">
      <section className="mx-auto grid w-full max-w-3xl gap-4 pt-2" aria-label="Start a session">
        <div className="flex items-center gap-3">
          <VistrialMark size="md" />
          <div>
            <h1 className="font-heading text-xl text-foreground">What should Vistrial work on?</h1>
            <p className="text-sm text-muted-foreground">Ask in your own words. It starts from what it knows about your business and asks only what&apos;s missing.</p>
          </div>
        </div>
        <StartChat size="hero" placeholder="For example: why are we losing move-out jobs to other cleaners?" />
      </section>
      <DecisionsView />
    </div>
  );
}
