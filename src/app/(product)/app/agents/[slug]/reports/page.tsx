import { redirect } from "next/navigation";

/** Reports live under Results in the Research workspace. */
export default async function ReportsRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/app/agents/${slug}/work/research#results`);
}
