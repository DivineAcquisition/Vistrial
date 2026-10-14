import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { requireStaff } from "@/lib/auth/gates";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Shared conversation" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Part = { type?: string; text?: string };
type Shared = { title: string | null; shared_at: string; expires_at: string; messages: Array<{ role: string; parts: Part[]; at: string }> };

/**
 * A Compass conversation its author shared with the team. Read only, while
 * the share lasts; opening it is logged in the workspace's history. Only the
 * words are shown: lookups appear as steps, not their data.
 */
export default async function SharedConversationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await db.rpc("compass_shared_conversation", { p_share_id: id });
  if (error || !data) notFound();
  const shared = data as Shared;

  return (
    <PageFrame
      title={shared.title ?? "Shared conversation"}
      description={`Shared ${formatDateTime(shared.shared_at)}. You can read it until ${formatDateTime(shared.expires_at)}. Opening it is recorded in the workspace's history.`}
      breadcrumbs={[
        { href: "/app/team/compass", label: "Compass" },
        { href: `/app/team/compass/shared/${id}`, label: "Shared conversation" },
      ]}
    >
      <div className="flex flex-col gap-3">
        {shared.messages.map((message, index) => {
          const text = (message.parts ?? [])
            .filter((part) => part.type === "text" && typeof part.text === "string")
            .map((part) => part.text)
            .join("\n")
            .trim();
          const steps = (message.parts ?? []).filter((part) => typeof part.type === "string" && part.type.startsWith("tool-")).length;
          return (
            <Panel key={index} className={message.role === "user" ? "ml-auto max-w-[85%] bg-brand-500/10 p-4" : "p-4"}>
              <p className={helperClass}>
                {message.role === "user" ? "Question" : "Compass"} · {formatDateTime(message.at)}
                {steps ? ` · ${steps} lookup${steps === 1 ? "" : "s"}` : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-card-foreground">{text || "(no text)"}</p>
            </Panel>
          );
        })}
      </div>
    </PageFrame>
  );
}
