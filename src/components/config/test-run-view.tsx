import { StatusBadge } from "@/components/ui/status-badge";
import type { TestRunStep } from "@/lib/config/test-run";
import { captionText } from "@/lib/ui";

/** The steps of a dry run with a sample lead. */
export function TestRunView({ steps }: { steps: TestRunStep[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {steps.map((step) => (
        <div key={step.title} className="rounded-xl border border-border p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-card-foreground">{step.title}</span>
            <StatusBadge label={step.ok ? "OK" : "Check"} tone={step.ok ? "good" : "warning"} />
          </div>
          {step.lines.map((line) => (
            <p key={line} className={captionText}>
              {line}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
