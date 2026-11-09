import { redirect } from "next/navigation";

/** A session's old link opens it in its workspace tab. A diagnosis moves on to Diagnostics from there. */
export default async function SessionRedirect({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  redirect(`/app/agents/${slug}/work/research/${encodeURIComponent(id)}`);
}
