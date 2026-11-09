import { redirect } from "next/navigation";

/** Starting a session happens in the Research workspace's chat. The conversation and any objective carry over. */
export default async function NewSessionRedirect({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const query = await searchParams;
  const keep = new URLSearchParams();
  for (const key of ["intake", "objective"]) {
    const value = query[key];
    if (typeof value === "string" && value) keep.set(key, value);
  }
  const rest = keep.toString();
  redirect(`/app/agents/${slug}/work/research${rest ? `?${rest}` : ""}`);
}
