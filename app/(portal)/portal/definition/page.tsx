import { PortalShell } from "@/components/portal/shell";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { requireClient } from "@/lib/auth";
import { listDefinitions } from "@/lib/db/appointment-definitions";
import { loadPortalDashboard } from "@/lib/db/portal";
import { formatDayLong } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalDefinitionPage() {
  const session = await requireClient();
  const dashboard = await loadPortalDashboard(session.membership.client_id);
  const definitions = await listDefinitions(session.membership.client_id);
  const current = definitions[0] ?? null;

  return (
    <PortalShell
      clientName={dashboard.client.name}
      active="/portal/definition"
      readOnly={session.readOnly}
    >
      <PageHeader
        eyebrow="Definition"
        title="What counts as an appointment"
        description="Every confirmed appointment is stamped with the version in force when it was created. That version never changes after the fact."
      />

      {!current ? (
        <EmptyState
          title="No definition on record."
          detail="Ask Divine Acquisition to publish version one before appointments are confirmed."
        />
      ) : (
        <div className="space-y-6">
          <Panel className="px-5 py-4">
            <p className="text-xs text-dim">
              Version {current.version} · effective{" "}
              {formatDayLong(current.effective_from)}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-silver">
              {current.criteria}
            </p>
            <div className="mt-4">
              <DefinitionList>
                <KeyValue label="Service area">
                  {current.service_area ?? "—"}
                </KeyValue>
                <KeyValue label="Accepted job types">
                  {(current.accepted_job_types ?? []).join(", ") || "—"}
                </KeyValue>
              </DefinitionList>
            </div>
          </Panel>

          {definitions.length > 1 ? (
            <div>
              <p className="mb-3 text-[11px] font-semibold tracking-[0.15em] text-dim uppercase">
                Earlier versions
              </p>
              <div className="space-y-3">
                {definitions.slice(1).map((definition) => (
                  <Panel key={definition.id} className="px-5 py-3">
                    <p className="text-xs text-dim">
                      Version {definition.version} ·{" "}
                      {formatDayLong(definition.effective_from)}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-silver">
                      {definition.criteria}
                    </p>
                  </Panel>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </PortalShell>
  );
}
