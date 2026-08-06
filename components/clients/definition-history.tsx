import { DefinitionDialog } from "@/components/clients/definition-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { TonePill } from "@/components/ui/tone";
import { formatDayLong } from "@/lib/format";
import { btnPrimary, btnSizeSm } from "@/lib/ui";
import type { AppointmentDefinition } from "@/types/database";

function JobTypes({ types }: { types: string[] | null }) {
  if (!types || types.length === 0) {
    return <span className="text-dim">—</span>;
  }

  return (
    <span className="flex flex-wrap gap-1.5">
      {types.map((type) => (
        <TonePill key={type} tone="neutral">
          {type}
        </TonePill>
      ))}
    </span>
  );
}

/** Definitions arrive newest first. */
export function DefinitionHistory({
  clientId,
  definitions,
}: {
  clientId: string;
  definitions: AppointmentDefinition[];
}) {
  const [current, ...previous] = definitions;
  const nextVersion = (current?.version ?? 0) + 1;

  return (
    <div className="space-y-8">
      <div>
        <SectionHeader
          title="Current definition"
          hint="Governs appointments created from now on."
          actions={
            <DefinitionDialog
              clientId={clientId}
              current={current ?? null}
              nextVersion={nextVersion}
              trigger={
                <button type="button" className={`${btnPrimary} ${btnSizeSm}`}>
                  New Version
                </button>
              }
            />
          }
        />

        {current ? (
          <Panel className="border-l-2 border-l-brand-500 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">
                Version {current.version}
              </p>
              <p className="text-xs text-dim">
                Effective {formatDayLong(current.effective_from)}
              </p>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-silver">
              {current.criteria}
            </p>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">
                  Service area
                </dt>
                <dd className="mt-1 text-sm text-silver">
                  {current.service_area ?? <span className="text-dim">—</span>}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">
                  Accepted job types
                </dt>
                <dd className="mt-1 text-sm text-silver">
                  <JobTypes types={current.accepted_job_types} />
                </dd>
              </div>
            </dl>
          </Panel>
        ) : (
          <EmptyState
            title="No definition on record."
            detail="Every client is created with version one, so this should not happen. Add a version to restore the rule appointments are judged against."
          />
        )}

        <p className="mt-3 text-xs leading-relaxed text-dim">
          Appointments are judged against the definition version in effect when
          they were created. A new version never applies retroactively.
        </p>
      </div>

      <div>
        <SectionHeader title="Earlier versions" hint="Newest first." />
        {previous.length === 0 ? (
          <p className="text-sm text-dim">
            No earlier versions. This client has only ever had one definition.
          </p>
        ) : (
          <ol className="space-y-2">
            {previous.map((definition) => (
              <li
                key={definition.id}
                className="rounded-2xl border border-border bg-muted/40 px-5 py-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-silver">
                    Version {definition.version}
                  </p>
                  <p className="text-xs text-dim">
                    Effective {formatDayLong(definition.effective_from)}
                  </p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-dim">
                  {definition.criteria}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
