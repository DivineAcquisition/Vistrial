import { PortalDisputeForm } from "@/components/portal/dispute-form";
import { PortalShell } from "@/components/portal/shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { TonePill } from "@/components/ui/tone";
import { describeWindow, reviewWindow, windowTone } from "@/lib/appointments/review-window";
import { requireClient } from "@/lib/auth";
import { loadPortalDashboard } from "@/lib/db/portal";
import { formatDateTime, formatMoney, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalAppointmentsPage() {
  const session = await requireClient();
  const dashboard = await loadPortalDashboard(session.membership.client_id);
  const appointments = dashboard.appointments;

  return (
    <PortalShell
      clientName={dashboard.client.name}
      active="/portal/appointments"
      readOnly={session.readOnly}
    >
      <PageHeader
        eyebrow="Appointments"
        title="Your appointments"
        description="Dispute only while the review window is open. Once it closes the appointment is locked for billing."
      />

      {appointments.length === 0 ? (
        <EmptyState
          title="No appointments yet."
          detail="Confirmed appointments appear here with their review window."
        />
      ) : (
        <div className="space-y-3">
          {appointments.map((appointment) => {
            const window = reviewWindow(appointment);
            const canDispute = window.state === "open" && !session.readOnly;

            return (
              <Panel key={appointment.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {formatDateTime(appointment.scheduled_for)}
                    </p>
                    <p className="mt-1 text-xs text-dim">
                      Definition v{appointment.definition_version}
                      {appointment.rate_applied !== null
                        ? ` · ${formatMoney(appointment.rate_applied)}`
                        : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <TonePill
                      tone={
                        appointment.status === "disputed"
                          ? "critical"
                          : appointment.status === "confirmed"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {titleCase(appointment.status)}
                    </TonePill>
                    <TonePill tone={windowTone(window)}>
                      {describeWindow(window)}
                    </TonePill>
                  </div>
                </div>

                {appointment.status === "disputed" && appointment.dispute_reason ? (
                  <p className="mt-3 text-sm text-silver">
                    Your dispute: {appointment.dispute_reason}
                  </p>
                ) : null}

                {canDispute ? (
                  <div className="mt-4">
                    <PortalDisputeForm appointmentId={appointment.id} />
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </div>
      )}
    </PortalShell>
  );
}
