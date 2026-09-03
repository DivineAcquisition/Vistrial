import { notFound, redirect } from "next/navigation";

import { isLeadId } from "@/lib/cases/filters";
import { throwIfForcedRouteError } from "@/lib/route-error";

export default async function PrecallBriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  throwIfForcedRouteError(query.forceError);
  if (!isLeadId(id)) notFound();
  redirect(`/app/cases/${id}`);
}
