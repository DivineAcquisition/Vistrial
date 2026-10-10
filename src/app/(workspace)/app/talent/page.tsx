import Link from "next/link";

import { addApplicantAction } from "@/app/(workspace)/app/talent/actions";
import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listApplicants } from "@/lib/talent/data";
import { DECISION_LABEL } from "@/lib/talent/score";
import { STAGE_LABEL } from "@/lib/talent/questions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Talent" };

export default async function TalentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : null;
  const people = await listApplicants();

  return (
    <PageFrame
      title="Talent"
      description="Sales operator applicants. An interview is scored after it is submitted, and the report is the record. Nothing on this page is sent to the applicant."
      breadcrumbs={[{ href: "/app/talent", label: "Talent" }]}
    >
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      <form action={addApplicantAction} className="mb-8 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4">
        <Input name="fullName" required placeholder="Full name" aria-label="Full name" />
        <Input name="email" type="email" required placeholder="Email" aria-label="Email" />
        <Input name="phone" placeholder="Phone" aria-label="Phone" />
        <Button type="submit" variant="primary">Add applicant</Button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 font-medium">Applicant</th>
              <th scope="col" className="px-3 py-2 font-medium">Stage</th>
              <th scope="col" className="px-3 py-2 font-medium">Latest score</th>
              <th scope="col" className="px-3 py-2 font-medium">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id} className="border-b border-border last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  <Link href={`/app/talent/${person.id}`} className="underline-offset-4 hover:underline">
                    {person.fullName}
                  </Link>
                  <div className="font-normal text-muted-foreground">{person.email}</div>
                </th>
                <td className="px-3 py-2">{STAGE_LABEL[person.stage]}</td>
                <td className="px-3 py-2 tabular-nums">{person.finalScore == null ? "—" : person.finalScore}</td>
                <td className="px-3 py-2">{person.decision ? DECISION_LABEL[person.decision] : "—"}</td>
              </tr>
            ))}
            {people.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  No applicants yet. The public form is at /hiring.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </PageFrame>
  );
}
