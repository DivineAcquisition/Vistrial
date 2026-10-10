import Link from "next/link";

import { HelpRequestForm } from "@/app/(workspace)/app/help/help-forms";
import { PageFrame } from "@/components/app/page-frame";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAuthContext } from "@/lib/auth/session";
import { formatDayLong } from "@/lib/format";
import { portalDb } from "@/lib/metrics/load";
import { HELP_ANSWERS } from "@/lib/portal/help-content";
import { HELP_STATUS, HELP_TOPICS, isHelpTopic, type HelpTopic } from "@/lib/portal/requests";
import { createClient } from "@/lib/supabase/server";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Help" };

type Params = Record<string, string | string[] | undefined>;

type RequestRow = {
  id: string;
  topic: HelpTopic;
  message: string;
  status: string;
  created_by_name: string;
  created_by_user_id: string;
  created_at: string;
  last_reply_at: string | null;
};

type UpdateRow = { id: string; title: string; body: string; published_at: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstLine(text: string): string {
  const line = text.split("\n")[0]?.trim() ?? "";
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

/** Quick answers, a way to reach the Vistrial team, past requests, and what changed recently. */
export default async function HelpPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await getAuthContext();
  const params = await searchParams;
  const one = (key: string) => (Array.isArray(params[key]) ? params[key]?.[0] : params[key]) as string | undefined;
  const topicParam = one("topic");
  const topic: HelpTopic = isHelpTopic(topicParam) ? topicParam : "general";
  const from = one("from");
  const pagePath = from && from.startsWith("/") && !from.startsWith("//") ? from.slice(0, 300) : null;
  const leadParam = one("lead");

  const db = await portalDb();
  const supabase = await createClient();
  const [{ data: requests }, { data: updates }, leadResult] = await Promise.all([
    db
      .from("help_requests")
      .select("id, topic, message, status, created_by_name, created_by_user_id, created_at, last_reply_at")
      .eq("org_id", ctx.org.id)
      .order("updated_at", { ascending: false })
      .limit(20),
    db.from("product_updates").select("id, title, body, published_at").lte("published_at", new Date().toISOString()).order("published_at", { ascending: false }).limit(6),
    leadParam && UUID.test(leadParam)
      ? supabase.from("leads").select("id, first_name, last_name").eq("org_id", ctx.org.id).eq("id", leadParam).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const rows = (requests ?? []) as RequestRow[];
  const leadRow = leadResult.data as { id: string; first_name: string | null; last_name: string | null } | null;
  const lead = leadRow
    ? { id: leadRow.id, name: [leadRow.first_name, leadRow.last_name].filter(Boolean).join(" ").trim() || "this lead" }
    : null;
  const answers = [...HELP_ANSWERS].sort((a, b) => Number(b.topic === topic) - Number(a.topic === topic));
  const seesOthers = ctx.workspaceRole === "owner" || ctx.isStaff;

  return (
    <PageFrame title="Help" description="Quick answers, and a direct line to your Vistrial team.">
      <section className="space-y-3" aria-labelledby="help-answers">
        <h2 id="help-answers" className={cardTitle}>
          Common questions
        </h2>
        <Panel className="px-6 py-2">
          <Accordion>
            {answers.map((item) => (
              <AccordionItem key={item.question} value={item.question}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionPanel>
                  <div className="space-y-2">
                    {item.answer.map((line) => (
                      <p key={line} className={helperClass}>
                        {line}
                      </p>
                    ))}
                    {item.link ? (
                      <Link href={item.link.href} className="text-sm text-brand-300 underline">
                        {item.link.label}
                      </Link>
                    ) : null}
                  </div>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </Panel>
      </section>

      <section className="space-y-3" aria-labelledby="help-ask">
        <h2 id="help-ask" className={cardTitle}>
          Ask your team
        </h2>
        <HelpRequestForm defaultTopic={topic} pagePath={pagePath} lead={lead} />
      </section>

      {rows.length ? (
        <Panel className="p-6">
          <h2 className={cardTitle}>{seesOthers ? "Requests from this workspace" : "Your requests"}</h2>
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {rows.map((row) => {
              const status = HELP_STATUS[row.status] ?? HELP_STATUS.received!;
              return (
                <li key={row.id} className="py-3">
                  <Link href={`/app/help/${row.id}`} className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-sm text-white">{firstLine(row.message)}</span>
                      <span className={helperClass}>
                        {HELP_TOPICS[row.topic] ?? HELP_TOPICS.general}
                        {seesOthers && row.created_by_user_id !== ctx.user.id ? ` · ${row.created_by_name}` : ""} ·{" "}
                        {formatDayLong(row.created_at)}
                      </span>
                    </span>
                    <StatusBadge label={status.label} tone={status.tone} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {(updates ?? []).length ? (
        <Panel className="p-6">
          <h2 className={cardTitle}>What is new</h2>
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {((updates ?? []) as UpdateRow[]).map((update) => (
              <li key={update.id} className="py-3">
                <p className="text-sm text-white">{update.title}</p>
                <p className={helperClass}>{formatDayLong(update.published_at)}</p>
                <p className={`mt-1 whitespace-pre-line ${helperClass}`}>{update.body}</p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </PageFrame>
  );
}
