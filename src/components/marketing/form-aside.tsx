import { Circle, CircleDashed, Loader2 } from "lucide-react";

import { PlatformLogo } from "@/components/marketing/platform-logo";
import { Badge } from "@/components/ui/badge";
import { FORMS } from "@/lib/marketing/content";
import { platformsIn } from "@/lib/marketing/platforms";
import { cn } from "@/lib/utils";

/**
 * Beside the request and contact forms: what happens after you send, shown as
 * the same run steps the landing page uses. The first step is the visitor's.
 */
export function FormAside({ kind }: { kind: "private_access" | "custom" }) {
  const steps = kind === "custom" ? FORMS.next.custom : FORMS.next.access;
  return (
    <aside aria-labelledby="form-next-title" className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 id="form-next-title" className="font-heading text-lg tracking-tight text-strong">
        {FORMS.next.title}
      </h2>
      <ol className="relative mt-5 space-y-5">
        <span aria-hidden className="absolute top-3 bottom-3 left-[11px] w-px bg-border" />
        {steps.map((step, index) => {
          const state = index === 0 ? "now" : index === 1 ? "next" : "later";
          return (
            <li key={step.title} className="relative flex gap-3">
              <span
                className={cn(
                  "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card",
                  state === "now" ? "border-brand-500/60 text-brand-300" : "border-border text-muted-foreground",
                )}
                aria-hidden
              >
                {state === "now" ? (
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
                ) : state === "next" ? (
                  <Circle className="size-3" />
                ) : (
                  <CircleDashed className="size-3.5 opacity-70" />
                )}
              </span>
              <div className="min-w-0 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-strong">{step.title}</p>
                  <Badge variant={state === "now" ? "info" : "outline"} size="sm">
                    {FORMS.next[state]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-6 border-t border-border pt-5">
        <p className="text-xs font-medium text-muted-foreground">{FORMS.next.sourcesLabel}</p>
        <ul className="mt-3 flex flex-wrap items-center gap-3 text-muted-foreground">
          {platformsIn("source")
            .filter((entry) => entry.id !== "facebook")
            .map((entry) => (
              <li key={entry.id} title={entry.name}>
                <PlatformLogo id={entry.id} tone="mono" size={20} />
              </li>
            ))}
        </ul>
      </div>
    </aside>
  );
}
