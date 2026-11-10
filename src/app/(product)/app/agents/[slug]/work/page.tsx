import { redirect } from "next/navigation";

/** The work area opens on Chat, the first tab. */
export default async function WorkRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/app/agents/${slug}/work/chat`);
}
