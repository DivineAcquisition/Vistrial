import { redirect } from "next/navigation";

/** Activity lives under Running now in the Research workspace; every run keeps its own page at /app/runs. */
export default async function ActivityRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/app/agents/${slug}/work/research#running`);
}
