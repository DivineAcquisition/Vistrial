import type { DefinitionView } from "@/components/appointments/types";
import { Panel } from "@/components/ui/panel";
import { TonePill } from "@/components/ui/tone";
import { formatDayLong } from "@/lib/format";

const DASH = "\u2014";

/**
 * The governing definition, in full, wherever an appointment is judged. The
 * criteria are read at the moment of the decision rather than remembered.
 */
export function DefinitionPanel({
  definition,
  version,
}: {
  definition: DefinitionView | null;
  version: number;
}) {
  if (definition === null) {
    return (
      <Panel className="border-l-2 border-l-flag-critical px-4 py-3">
        <p className="text-sm text-flag-critical">
          Version {version} governs this appointment, but the definition row could
          not be loaded.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="border-l-2 border-l-brand-500 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">
          Governing definition · version {definition.version}
        </p>
        <p className="text-xs text-dim">
          Effective {formatDayLong(definition.effectiveFrom)}
        </p>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-silver">
        {definition.criteria}
      </p>

      <dl className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.12em] text-dim uppercase">
            Service area
          </dt>
          <dd className="mt-1 text-sm text-silver">
            {definition.serviceArea ?? <span className="text-dim">{DASH}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.12em] text-dim uppercase">
            Accepted job types
          </dt>
          <dd className="mt-1 flex flex-wrap gap-1.5 text-sm text-silver">
            {definition.acceptedJobTypes.length === 0 ? (
              <span className="text-dim">{DASH}</span>
            ) : (
              definition.acceptedJobTypes.map((type) => (
                <TonePill key={type} tone="neutral">
                  {type}
                </TonePill>
              ))
            )}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
