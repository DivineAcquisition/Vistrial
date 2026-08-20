import { notFound } from "next/navigation";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  // No case-file data layer in this prompt. A missing id and an id from
  // another org are indistinguishable without leaking, so both are not-found.
  notFound();
}
