import { Panel } from "@/components/ui/panel";
import { formatDateTime } from "@/lib/format";
import type { HelpTopic } from "@/lib/portal/requests";
import { helperClass } from "@/lib/ui";

export type HelpRequestView = {
  id: string;
  org_id: string;
  topic: HelpTopic;
  message: string;
  status: string;
  page_path: string | null;
  lead_id: string | null;
  created_by_name: string;
  created_at: string;
};

export type HelpReplyView = { id: string; author_name: string; from_team: boolean; body: string; created_at: string };

export function HelpThread({ request, replies }: { request: HelpRequestView; replies: HelpReplyView[] }) {
  return (
    <ol className="space-y-3">
      <li>
        <Panel className="p-5">
          <p className={helperClass}>
            {request.created_by_name} · {formatDateTime(request.created_at)} UTC
          </p>
          <p className="mt-2 text-sm whitespace-pre-line text-white">{request.message}</p>
        </Panel>
      </li>
      {replies.map((reply) => (
        <li key={reply.id}>
          <Panel className={reply.from_team ? "border-brand-500/30 p-5" : "p-5"}>
            <p className={helperClass}>
              {reply.author_name} · {formatDateTime(reply.created_at)} UTC
            </p>
            <p className="mt-2 text-sm whitespace-pre-line text-white">{reply.body}</p>
          </Panel>
        </li>
      ))}
    </ol>
  );
}
