import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { getSubmittedInterview } from "@/lib/talent/data";
import { interviewReportPdf } from "@/lib/talent/report";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const interviewId = new URL(request.url).searchParams.get("interview") ?? "";
  const found = await getSubmittedInterview(interviewId);
  if (!found || found.applicant.id !== id || !found.interview.scorecard) return new NextResponse("Not found", { status: 404 });
  const bytes = await interviewReportPdf({
    applicantName: found.applicant.fullName,
    email: found.applicant.email,
    interviewer: found.interview.interviewerName || "Interviewer",
    submittedAt: found.interview.submittedAt || "",
    precheck: found.interview.precheck,
    answers: found.interview.draft.answers,
    card: found.interview.scorecard,
  });
  const filename = `${found.applicant.fullName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "interview"}-report.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
