import { BoardScreen } from "./board-screen";

/** ?focus=id1,id2 opens the board on the sources behind one finding. */
export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const focus = typeof query.focus === "string" ? query.focus.split(",").filter(Boolean).slice(0, 40) : [];
  return <BoardScreen projectId={id} focus={focus} />;
}
