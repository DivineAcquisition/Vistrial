import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { getAuthContext } from "@/lib/auth/session";
import { isLeadId } from "@/lib/cases/filters";
import { loadOrgCaseFile } from "@/lib/cases/load";
import { loadScribeCaseFile } from "@/lib/scribe/case-file";
import { formatFieldValue } from "@/lib/scribe/view";

export default async function CasePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isLeadId(id)) notFound();
  const ctx = await getAuthContext();
  if (!(ctx.isStaff || ctx.workspaceRole === "owner" || ctx.isPlatformAdmin)) notFound();
  const payload = await loadOrgCaseFile(id);
  if (!payload) notFound();
  const scribe = await loadScribeCaseFile(payload.lead.orgId, payload.lead.id).catch(() => null);

  return (
    <PageFrame title={payload.lead.name} description="A printable case file. Internal notes are left out.">
      <article className="space-y-4 text-sm print:text-black">
        <p>
          <Link href={`/app/cases/${payload.lead.id}`} className="underline print:hidden">Back to the case file</Link>
        </p>
        <h2 className="text-lg font-semibold">{scribe?.summary ? scribe.summary.split(/(?<=[.!?])\s/)[0] : payload.lead.name}</h2>
        <p>{scribe?.summary ?? "Scribe has not written a summary yet."}</p>
        <p>
          Readiness: {scribe?.band ?? "Not yet scored"}
          {scribe?.readinessReason ? `. ${scribe.readinessReason}` : ""}
        </p>
        <p>Next step: {scribe?.nextStep ?? "None yet."}</p>
        <h3 className="font-medium">Facts</h3>
        <ul>
          {(scribe?.fields ?? []).filter((field) => field.state !== "absent").map((field) => (
            <li key={field.key}>{field.label}: {formatFieldValue(field.value)}</li>
          ))}
        </ul>
        <h3 className="font-medium">Objections</h3>
        <ul>
          {payload.objections.length === 0 ? <li>None recorded.</li> : null}
          {payload.objections.map((item) => (
            <li key={item.id}>{item.verbatim} · {item.resolved ? "addressed" : "unresolved"}</li>
          ))}
        </ul>
      </article>
    </PageFrame>
  );
}
