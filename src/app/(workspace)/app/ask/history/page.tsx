import Link from "next/link";
import type { Metadata } from "next";

import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listExecutions } from "@/lib/sales-os/executions/run";
import { EXECUTION_STATUS_LABELS, ROLE_LABELS, TIER_LABELS, TOOL_STATE_LABELS } from "@/lib/sales-os/labels";
import { dayRange, formatZoned, happenedDuring } from "@/lib/sales-os/day-range";
import { listConversations, listToolCalls } from "@/lib/sales-os/persist";
import { salesOsActor } from "@/lib/sales-os/session";
import { captionText, sectionTitle } from "@/lib/ui";

export const metadata: Metadata = { title: "What Vistrial did" };

export default async function SalesOsHistoryPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const actor = await salesOsActor();
  const { day } = await searchParams;
  const range = dayRange(day, actor.orgTimezone);
  const bounds = "from" in range ? { from: range.from, to: range.to } : {};
  const [executions, steps, conversations] = await Promise.all([
    listExecutions(actor.db, actor.orgId, bounds),
    listToolCalls(actor, bounds),
    listConversations(actor, { everyone: actor.canSeeMoney }),
  ]);
  const shownConversations = conversations.filter((c) => happenedDuring(c.lastMessageAt ?? c.createdAt, range));
  const when = (iso: string) => formatZoned(iso, actor.orgTimezone);

  return (
    <PageFrame
      title="What Vistrial did"
      description={
        actor.canSeeMoney
          ? "Every conversation, every step, and everything that left Vistrial, with the person it acted for."
          : "Your conversations with Vistrial and every step it took for you."
      }
      breadcrumbs={[{ label: "Ask Vistrial", href: "/app/ask" }, { label: "What Vistrial did", href: "/app/ask/history" }]}
      toolbar={
        <form className="flex flex-wrap items-end gap-2" action="/app/ask/history">
          <label className="grid gap-1 text-sm text-card-foreground">
            <span className={captionText}>Go to a day</span>
            <Input type="date" name="day" defaultValue={day ?? ""} className="w-44" />
          </label>
          <Button type="submit" variant="outline" size="sm">
            Show that day
          </Button>
          {"from" in range ? (
            <Button variant="ghost" size="sm" render={<Link href="/app/ask/history" />}>
              Back to most recent
            </Button>
          ) : null}
        </form>
      }
    >
      <p className={captionText}>
        Showing: {range.label}. Times and days follow this workspace&apos;s time zone ({actor.orgTimezone}).
      </p>

      <section className="space-y-3">
        <h2 className={sectionTitle}>Outside Vistrial</h2>
        <Card>
          <CardPanel className="p-0">
            {executions.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>What</TableHead>
                    <TableHead>Asked by</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.map((row) => {
                    const status = EXECUTION_STATUS_LABELS[row.status] ?? { label: row.status, tone: "neutral" as const };
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap">{when(row.createdAt)}</TableCell>
                        <TableCell className="min-w-64">
                          <Link href={`/app/ask?c=${row.conversationId}`} className="hover:underline">
                            {row.plainSummary}
                          </Link>
                        </TableCell>
                        <TableCell>{row.requestedByName}</TableCell>
                        <TableCell className="min-w-40">
                          {row.gateSatisfiedBy === "in_conversation_approval"
                            ? `Approved by ${row.approvedByName ?? "someone"}`
                            : row.gateSatisfiedBy === "prior_configuration"
                              ? "Ran without asking, as set"
                              : row.status === "rejected"
                                ? `Rejected by ${row.rejectedByName ?? "someone"}${row.rejectionReason ? `: ${row.rejectionReason}` : ""}`
                                : "Waiting"}
                        </TableCell>
                        <TableCell className="min-w-48">
                          <StatusBadge label={status.label} tone={status.tone} />
                          {row.resultSummary || row.errorText ? (
                            <span className="mt-1 block text-xs text-muted-foreground">{row.resultSummary ?? row.errorText}</span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">Nothing left Vistrial {"from" in range ? "that day" : "yet"}.</p>
            )}
          </CardPanel>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className={sectionTitle}>Every step</h2>
        <Card>
          <CardPanel className="p-0">
            {steps.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>What Vistrial did</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Acting for</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {steps.map((step) => {
                    const state = TOOL_STATE_LABELS[step.state] ?? { label: step.state, tone: "neutral" as const };
                    return (
                      <TableRow key={step.id}>
                        <TableCell className="whitespace-nowrap">{when(step.startedAt)}</TableCell>
                        <TableCell className="min-w-64">
                          <Link href={`/app/ask?c=${step.conversationId}`} className="hover:underline">
                            {step.label}
                          </Link>
                          {step.conversationTitle ? (
                            <span className="block text-xs text-muted-foreground">In “{step.conversationTitle}”</span>
                          ) : null}
                        </TableCell>
                        <TableCell>{TIER_LABELS[step.tier] ?? step.tier}</TableCell>
                        <TableCell>
                          {step.actedAs} <span className="text-muted-foreground">({ROLE_LABELS[step.actedAsRole] ?? step.actedAsRole})</span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge label={state.label} tone={state.tone} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">No steps {"from" in range ? "that day" : "yet"}.</p>
            )}
          </CardPanel>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className={sectionTitle}>Conversations</h2>
        <Card>
          <CardPanel className="p-0">
            {shownConversations.length ? (
              <ul className="divide-y divide-border">
                {shownConversations.map((conversation) => (
                  <li key={conversation.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Link href={`/app/ask?c=${conversation.id}`} className="text-sm font-medium text-card-foreground hover:underline">
                      {conversation.title ?? "Untitled conversation"}
                    </Link>
                    <span className={captionText}>
                      {conversation.isMine ? "You" : conversation.ownerName} · {when(conversation.lastMessageAt ?? conversation.createdAt)}
                      {conversation.status === "archived" ? " · archived" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">No conversations {"from" in range ? "that day" : "yet"}.</p>
            )}
          </CardPanel>
        </Card>
      </section>
    </PageFrame>
  );
}
