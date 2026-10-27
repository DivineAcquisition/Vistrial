import { cn } from "@/lib/utils";
import { centsInWords, formatCents, type CostView } from "@/lib/runs/view";

/**
 * Cost so far against the per-run cap. The soft warning and the hard stop are
 * different marks, a thin tick and a solid bar end, so a warning never reads
 * as the limit itself.
 */
export function CostBar({ cost }: { cost: CostView }) {
  const cap = Math.max(cost.runCapCents, 1);
  const share = Math.min(cost.spentCents / cap, 1);
  const warnAt = Math.min(cost.softWarningCents / cap, 1);
  const over = cost.spentCents >= cost.runCapCents;
  const warning = !over && cost.spentCents >= cost.softWarningCents;
  const dayShare = Math.min(cost.daySpentCents / Math.max(cost.dayCapCents, 1), 1);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-card-foreground">This run</span>
          <span className="text-muted-foreground">
            <span aria-hidden="true">
              {formatCents(cost.spentCents)} of {formatCents(cost.runCapCents)}
            </span>
            <span className="sr-only">
              {centsInWords(cost.spentCents)} spent of a {centsInWords(cost.runCapCents)} limit
            </span>
          </span>
        </div>
        <div
          role="meter"
          aria-label="Run cost against its limit"
          aria-valuemin={0}
          aria-valuemax={cost.runCapCents}
          aria-valuenow={Math.min(cost.spentCents, cost.runCapCents)}
          aria-valuetext={`${centsInWords(cost.spentCents)} of ${centsInWords(cost.runCapCents)}`}
          className="relative h-2.5 w-full overflow-visible rounded-full bg-muted"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
              over ? "bg-destructive" : warning ? "bg-warning" : "bg-primary",
            )}
            style={{ width: `${share * 100}%` }}
          />
          <span
            aria-hidden="true"
            className="absolute -top-1 h-4.5 w-px bg-warning"
            style={{ left: `${warnAt * 100}%` }}
          />
          <span aria-hidden="true" className="absolute -top-1 right-0 h-4.5 w-1 rounded-sm bg-foreground" />
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>
            <span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-px bg-warning align-middle" />
            Warning at {formatCents(cost.softWarningCents)}
          </span>
          <span>
            <span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-1 rounded-sm bg-foreground align-middle" />
            Stops at {formatCents(cost.runCapCents)}
          </span>
        </div>
        {over ? <p className="text-sm text-destructive">This run reached its limit.</p> : null}
        {warning ? <p className="text-sm text-warning">This run is close to its limit.</p> : null}
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-card-foreground">Today, this agent</span>
          <span className="text-muted-foreground">
            <span aria-hidden="true">
              {formatCents(cost.daySpentCents)} of {formatCents(cost.dayCapCents)}
            </span>
            <span className="sr-only">
              {centsInWords(cost.daySpentCents)} spent today of a {centsInWords(cost.dayCapCents)} daily limit
            </span>
          </span>
        </div>
        <div aria-hidden="true" className="h-1.5 w-full rounded-full bg-muted">
          <div className="h-full rounded-full bg-muted-foreground/60" style={{ width: `${dayShare * 100}%` }} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {cost.inputTokens.toLocaleString("en-US")} tokens in, {cost.outputTokens.toLocaleString("en-US")} tokens out.
      </p>
    </div>
  );
}
