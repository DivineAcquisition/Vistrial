import Link from "next/link";
import { notFound } from "next/navigation";

import { interviewAction, setStageAction } from "@/app/(workspace)/app/talent/actions";
import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { blankDraft, getApplicant, interviewsFor, scoreInputsFrom } from "@/lib/talent/data";
import {
  CLOSING,
  OPENING,
  QUESTIONS,
  ROLEPLAY_CHECKS,
  STAGES,
  STAGE_LABEL,
} from "@/lib/talent/questions";
import { combineInterviews, DECISION_LABEL, scoreInterview } from "@/lib/talent/score";
import { toScoreInput } from "@/lib/talent/parse";

export const dynamic = "force-dynamic";

const selectClass = "rounded-md border border-border bg-background px-2 py-1 text-sm";

function notice(query: Record<string, string | string[] | undefined>): string | null {
  if (typeof query.error === "string") return query.error;
  if (query.saved === "1") return "Saved.";
  if (query.submitted === "1") return "Submitted. The score is frozen and the report is ready.";
  return null;
}

export default async function InterviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const applicant = await getApplicant(id);
  if (!applicant) notFound();
  const records = await interviewsFor(id);
  const draft = records.find((record) => record.status === "draft")?.draft ?? blankDraft(applicant);
  const submitted = records.filter((record) => record.status === "submitted" && record.scorecard);
  const previewParsed = toScoreInput(draft);
  const preview = previewParsed.ok ? scoreInterview(previewParsed.input) : null;
  const combined = submitted.length > 1 ? combineInterviews(scoreInputsFrom(submitted)) : null;
  const message = notice(query);

  return (
    <PageFrame
      title={applicant.fullName}
      eyebrow="Sales Operator"
      description={`${applicant.email}${applicant.phone ? ` · ${applicant.phone}` : ""} · ${STAGE_LABEL[applicant.stage]}. Do not tell the candidate the score.`}
      breadcrumbs={[{ href: "/app/talent", label: "Talent" }, { href: `/app/talent/${id}`, label: applicant.fullName }]}
    >
      {message ? <p className={`mb-4 text-sm ${typeof query.error === "string" ? "text-destructive" : "text-muted-foreground"}`}>{message}</p> : null}

      <form action={setStageAction} className="mb-6 flex flex-wrap items-center gap-2">
        <input type="hidden" name="applicantId" value={applicant.id} />
        <label className="text-sm text-muted-foreground" htmlFor="stage">Stage</label>
        <select id="stage" name="stage" defaultValue={applicant.stage} className={selectClass}>
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>{STAGE_LABEL[stage]}</option>
          ))}
        </select>
        <Button type="submit" size="sm">Update stage</Button>
      </form>

      {submitted.length > 0 ? (
        <section className="mb-8 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium">Submitted interviews</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {submitted.map((record) => (
              <li key={record.id} className="flex flex-wrap items-center gap-3">
                <span>{record.interviewerName || "Interviewer"} · {record.scorecard ? DECISION_LABEL[record.scorecard.decision] : ""} · {record.scorecard?.finalScore ?? "—"} / 100</span>
                <Link className="underline-offset-4 hover:underline" href={`/app/talent/${applicant.id}/report?interview=${record.id}`}>
                  Download report
                </Link>
              </li>
            ))}
          </ul>
          {combined && !("error" in combined) && combined.disagreements.length > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{combined.card.reason}</p>
          ) : null}
        </section>
      ) : null}

      {preview?.ok ? (
        <section className="mb-8 rounded-2xl border border-border bg-card p-4 text-sm">
          <h2 className="font-medium">Preview, not submitted</h2>
          <p className="mt-2">{DECISION_LABEL[preview.card.decision]}. Final score {preview.card.finalScore} of 100.</p>
          <p className="mt-1 text-muted-foreground">{preview.card.reason}</p>
        </section>
      ) : null}

      <form action={interviewAction} className="grid max-w-3xl gap-8">
        <input type="hidden" name="applicantId" value={applicant.id} />
        <p className="text-sm text-muted-foreground">{OPENING}</p>
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">Before the questions</legend>
          <label className="grid gap-1 text-sm">Availability
            <Input name="availability" defaultValue={draft.precheck.availability} />
          </label>
          <label className="grid gap-1 text-sm">Time zone
            <Input name="timezone" defaultValue={draft.precheck.timezone} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <YesNo name="quiet_space" label="Quiet space" value={draft.precheck.quietSpace} />
            <YesNo name="internet" label="Reliable internet" value={draft.precheck.reliableInternet} />
            <YesNo name="headset" label="Headset" value={draft.precheck.headset} />
            <YesNo name="computer" label="Computer" value={draft.precheck.computer} />
            <YesNo name="start_soon" label="Can start within two weeks" value={draft.precheck.canStartSoon} />
          </div>
          <label className="grid gap-1 text-sm">CRM or calling tool
            <Input name="crm" defaultValue={draft.precheck.crm} />
          </label>
        </fieldset>

        {QUESTIONS.map((question) => {
          const answer = draft.answers[question.id];
          return (
            <fieldset key={question.id} className="grid gap-3 border-t border-border pt-6">
              <legend className="text-sm font-medium">Question {question.number}. {question.title}{question.gate ? " · gate" : ""}</legend>
              <p className="text-sm">{question.prompt}</p>
              <p className="text-sm text-muted-foreground">One probe, only if the answer is not already specific: {question.probe}</p>
              <p className="text-sm text-muted-foreground">Screener only: {question.guide}</p>
              <label className="grid gap-1 text-sm">What they said
                <Textarea name={`${question.id}_answer`} defaultValue={answer.answer} rows={4} />
              </label>
              <label className="grid gap-1 text-sm">Probe answer, if you asked
                <Textarea name={`${question.id}_probe`} defaultValue={answer.probe} rows={2} />
              </label>
              <label className="grid gap-1 text-sm">Quote that supports the score
                <Input name={`${question.id}_quote`} defaultValue={answer.quote} />
              </label>
              <label className="grid gap-1 text-sm">Score
                <select name={`${question.id}_score`} defaultValue={answer.score ?? ""} className={selectClass} aria-label={`Score for question ${question.number}`}>
                  <option value="">Not scored</option>
                  {[1, 2, 3, 4, 5].map((score) => (
                    <option key={score} value={score}>{score}</option>
                  ))}
                </select>
              </label>
              {question.id === "q6" ? (
                <div className="grid gap-2 text-sm">
                  {ROLEPLAY_CHECKS.map((check) => (
                    <label key={check.key} className="flex items-center gap-2">
                      <input type="checkbox" name={`roleplay_${check.key}`} value="yes" defaultChecked={draft.roleplay[check.key]} />
                      {check.label}
                    </label>
                  ))}
                </div>
              ) : null}
            </fieldset>
          );
        })}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dishonesty" value="yes" defaultChecked={draft.dishonesty} />
          An example fell apart. This answer was not truthful.
        </label>
        <p className="text-sm text-muted-foreground">{CLOSING}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="save">Save draft</Button>
          <Button type="submit" name="intent" value="submit" variant="primary">Submit and score</Button>
        </div>
      </form>
    </PageFrame>
  );
}

function YesNo({ name, label, value }: { name: string; label: string; value: boolean }) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <select name={name} defaultValue={value ? "yes" : "no"} className={selectClass}>
        <option value="no">No</option>
        <option value="yes">Yes</option>
      </select>
    </label>
  );
}
