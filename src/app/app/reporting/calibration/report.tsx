import { CalibrationReportView } from "@/app/app/reporting/calibration/report-view";
import { loadCalibrationReport, previewScoreConfigChange } from "@/lib/calibration/load";

export async function CalibrationReport({
  orgId,
  isPlatformAdmin = false,
}: {
  orgId: string;
  isPlatformAdmin?: boolean;
}) {
  const payload = await loadCalibrationReport(orgId);
  const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
  const pending = suggestions.find((row) => {
    const rec = row && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
    return rec.status === "pending" && rec.kind === "weights";
  });
  let preview: Record<string, unknown> | null = null;
  if (pending && typeof pending === "object" && !Array.isArray(pending)) {
    const body = pending as Record<string, unknown>;
    const payloadRec =
      body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : {};
    const proposed =
      payloadRec.proposed && typeof payloadRec.proposed === "object" && !Array.isArray(payloadRec.proposed)
        ? (payloadRec.proposed as Record<string, unknown>)
        : null;
    if (proposed) {
      preview = await previewScoreConfigChange(
        orgId,
        {
          timeline: Number(proposed.timeline),
          investment_capacity: Number(proposed.investment_capacity),
          decision_authority: Number(proposed.decision_authority),
          pain_severity: Number(proposed.pain_severity),
        },
        Number(proposed.ready_threshold)
      );
    }
  }
  return (
    <CalibrationReportView payload={payload} preview={preview} isPlatformAdmin={isPlatformAdmin} />
  );
}
