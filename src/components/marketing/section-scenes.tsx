import type { LiveAgentId } from "@/lib/agents/roster";
import { marketingInset } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

const scene = "h-32 overflow-hidden rounded-lg border border-[#2a2833] bg-[#12111a] p-3";

/** Three records that do not line up: CRM, dialer, and calendar. */
export function ProblemScene() {
  const lanes = [
    { label: "CRM", delay: "0s" },
    { label: "Dialer", delay: "0.45s" },
    { label: "Calendar", delay: "0.9s" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2" aria-hidden>
      {lanes.map((lane) => (
        <div
          key={lane.label}
          className={cn(marketingInset, "animate-vistrial-shift p-3 motion-reduce:animate-none")}
          style={{ animationDelay: lane.delay }}
        >
          <p className="text-[11px] font-semibold tracking-wide text-white uppercase">{lane.label}</p>
          <div className="mt-3 space-y-2">
            <div className="h-2 rounded-sm bg-[#3a3650]" />
            <div className="h-2 w-4/5 rounded-sm bg-[#3a3650]" />
            <div className="h-2 w-1/2 rounded-sm bg-[#3a3650]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ActScene() {
  return (
    <div className={scene} aria-hidden>
      <div className={cn(marketingInset, "h-full p-3")}>
        <div className="h-2 w-4/5 rounded-sm bg-[#3a3650]" />
        <div className="mt-2 h-2 w-3/5 rounded-sm bg-[#3a3650]" />
        <div className="mt-4 inline-flex animate-vistrial-glow rounded-md border border-[#2a2833] bg-brand-500 px-3 py-1.5 text-xs font-medium text-white motion-reduce:animate-none">
          Approve
        </div>
      </div>
    </div>
  );
}

export function AgentScene({ id }: { id: LiveAgentId }) {
  if (id === "sentry") {
    return (
      <div className={cn(scene, "flex items-end gap-2")} aria-hidden>
        {[40, 68, 32, 86, 54].map((height, index) => (
          <div key={height} className="flex h-full flex-1 items-end">
            <div
              className={cn(
                "w-full rounded-sm border border-[#2a2833]",
                index === 3 ? "animate-vistrial-highlight bg-brand-400 motion-reduce:animate-none" : "bg-[#1c1a27]",
              )}
              style={{ height: `${height}%` }}
            />
          </div>
        ))}
      </div>
    );
  }
  if (id === "relay") return <ActScene />;
  if (id === "compass") {
    return (
      <div className={cn(scene, "flex flex-col justify-center gap-2")} aria-hidden>
        <div className={cn(marketingInset, "px-3 py-2 text-xs text-white")}>Ask</div>
        <div className="grid grid-cols-2 gap-2">
          {["Calls", "Case file"].map((label, index) => (
            <div
              key={label}
              className={cn(marketingInset, "animate-vistrial-highlight px-3 py-2 text-xs text-white motion-reduce:animate-none")}
              style={{ animationDelay: `${index * 0.6}s` }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={cn(scene, "flex flex-col justify-center gap-2")} aria-hidden>
      {["w-4/5", "w-full", "w-2/3", "w-3/5"].map((width, index) => (
        <div key={width} className="h-2 overflow-hidden rounded-sm border border-[#2a2833] bg-[#1c1a27]">
          <div
            className={cn("h-full animate-vistrial-grow bg-[#3a3650] motion-reduce:animate-none", width)}
            style={{ animationDelay: `${index * 0.35}s` }}
          />
        </div>
      ))}
    </div>
  );
}

export function SafetyScene() {
  const steps = [
    { label: "Draft", hold: false },
    { label: "Approval", hold: false },
    { label: "Not sent", hold: true },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-3" aria-hidden>
      {steps.map((step, index) => (
        <div
          key={step.label}
          className={cn(
            marketingInset,
            "px-4 py-4 text-sm font-medium text-white",
            step.hold ? "animate-vistrial-highlight motion-reduce:animate-none" : "bg-[#1c1a27]",
          )}
          style={{ animationDelay: `${index * 0.35}s` }}
        >
          {step.label}
        </div>
      ))}
    </div>
  );
}
