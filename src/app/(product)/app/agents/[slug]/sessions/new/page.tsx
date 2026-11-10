import { redirect } from "next/navigation";

import { newSessionLink } from "@/lib/shell/old-links";

/** Starting a session happens in the Chat tab. The conversation and any objective carry over. */
export default async function NewSessionRedirect({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  redirect(newSessionLink(`/app/agents/${slug}`, await searchParams));
}
