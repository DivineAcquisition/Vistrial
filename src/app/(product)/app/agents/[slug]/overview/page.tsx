import { redirect } from "next/navigation";

/** The overview is the agent's home. */
export default async function OverviewRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/app/agents/${slug}`);
}
