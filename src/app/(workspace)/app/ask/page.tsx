import { redirect } from "next/navigation";

import { isConversationId } from "@/lib/compass/persist";

/**
 * Ask Vistrial is now Compass. An old link to a conversation opens it,
 * read only, in Compass history for its author; anything else opens Compass.
 * What Vistrial did (/app/ask/history) and the saved scripts
 * (/app/ask/assets) stay where they are.
 */
export default async function AskPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  redirect(isConversationId(c) ? `/app/compass?c=${c}&legacy=1` : "/app/compass");
}
