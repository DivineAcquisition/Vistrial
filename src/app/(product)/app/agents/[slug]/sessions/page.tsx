import { redirect } from "next/navigation";

/** Sessions moved into the Research workspace. */
export default async function SessionsRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/app/agents/${slug}/work/research`);
}
