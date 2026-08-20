import { notFound } from "next/navigation";

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  notFound();
}
