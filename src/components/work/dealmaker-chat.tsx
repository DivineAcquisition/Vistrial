"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";

import { MessageSquareText, Plus, SendIcon } from "@/components/icons";
import { useClientScope } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { SectionTitle, WorkHero } from "./work-shell";

export type ChatData = FunctionReturnType<typeof api.dealmakerChat.get>;
export type ChatList = FunctionReturnType<typeof api.dealmakerChat.list>;
type Plan = NonNullable<ChatData["plan"]>;

export type ChatActions = {
  send: (text: string) => Promise<unknown>;
  /** Starts the planned work through its own start, at the budget shown. */
  start: (plan: Plan) => Promise<unknown>;
  open: (id: string | null) => void;
};

const STARTERS = ["How many open deals do I have?", "Who needs a move today?", "What's my show rate?", "Review my pipeline", "Draft my follow-ups"];

/** Dealmaker's chat with its data handed in, so a story can show it without a server. */
export function DealmakerChatView({ chat, list, editor, base, actions }: { chat: ChatData | null; list: ChatList; editor: boolean; base: string; actions: ChatActions }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      showError(error);
    }
    setBusy(false);
  };
  const submit = async (value: string) => {
    if (!value.trim()) return;
    await act(async () => {
      await actions.send(value);
      setText("");
    });
  };
  const plan = chat?.plan ?? null;
  return (
    <div className="grid min-w-0 gap-5">
      <WorkHero
        icon={MessageSquareText}
        agent="sales-conversion"
        eyebrow="Dealmaker · Chat"
        title="Ask about your pipeline, or hand Dealmaker work"
        promise="Questions about your pipeline are answered from your own CRM. Work is planned and priced first; nothing runs or spends until you press Start."
      />
      <div className="grid min-w-0 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Panel className="grid content-start gap-2 p-3">
          <Button size="sm" variant="outline" onClick={() => actions.open(null)}>
            <Plus aria-hidden className="size-3.5" />
            New chat
          </Button>
          {list.length ? (
            <ul className="grid gap-1">
              {list.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => actions.open(row.id)}
                    className={cn("w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted", chat?.id === row.id ? "bg-muted text-foreground" : "text-muted-foreground")}
                  >
                    {row.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 text-xs text-muted-foreground">No chats yet.</p>
          )}
        </Panel>
        <Panel className="grid min-w-0 content-start gap-3 p-4 sm:p-6" data-dealmaker-chat>
          <SectionTitle icon={MessageSquareText}>{chat?.title ?? "New chat"}</SectionTitle>
          {chat ? (
            <ol className="grid gap-2" aria-live="polite">
              {chat.messages.map((message, index) => (
                <li
                  key={index}
                  className={cn(
                    "max-w-[44rem] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    message.role === "person" ? "justify-self-end bg-primary/10 text-foreground" : "justify-self-start border border-border bg-card text-foreground",
                  )}
                >
                  {message.text}
                  {message.choices.length ? (
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {message.choices.map((choice) => (
                        <Button key={choice.value} size="sm" variant="outline" disabled={busy || !editor} onClick={() => void submit(choice.value)}>
                          {choice.label}
                        </Button>
                      ))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">Try one of these, or ask in your own words.</p>
              <div className="flex flex-wrap gap-1.5">
                {STARTERS.map((starter) => (
                  <Button key={starter} size="sm" variant="outline" disabled={busy || !editor} onClick={() => void submit(starter)}>
                    {starter}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {plan ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3" data-plan>
              <Button size="sm" disabled={busy || !editor || !chat?.canStart} onClick={() => void act(() => actions.start(plan))}>
                Start
              </Button>
              <span className="text-xs text-muted-foreground">Up to {plan.maxCredits} credits.</span>
              {plan.result ? (
                <Link href={`${base}/work/${plan.result.tab}`} className="text-xs text-primary underline-offset-2 hover:underline">
                  {plan.result.words}
                </Link>
              ) : null}
            </div>
          ) : null}
          {editor ? (
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void submit(text);
              }}
            >
              <Textarea aria-label="Message" rows={2} maxLength={1000} value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask Dealmaker" className="min-w-0 flex-1" />
              <Button type="submit" size="icon" aria-label="Send" disabled={busy || !text.trim()}>
                <SendIcon aria-hidden className="size-4" />
              </Button>
            </form>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

/** Dealmaker's chat for the organization or the client the picker names. */
export function DealmakerChat({ workspaceId, editor, base }: { workspaceId: Id<"workspaces">; editor: boolean; base: string }) {
  const { clientId } = useClientScope();
  const [chatId, setChatId] = useState<Id<"dealmakerChats"> | null>(null);
  const list = useQuery(api.dealmakerChat.list, { workspaceId, clientId });
  const chat = useQuery(api.dealmakerChat.get, chatId ? { workspaceId, chatId } : "skip");
  const send = useMutation(api.dealmakerChat.send);
  const started = useMutation(api.dealmakerChat.started);
  const pipelineReview = useMutation(api.dealmakerChat.startPipelineReview);
  const followUps = useMutation(api.dealFollowUps.draft);
  const brief = useMutation(api.dealBriefings.request);
  const callReview = useMutation(api.callReviews.request);
  if (list === undefined) return <p className="text-sm text-muted-foreground">Opening the chat…</p>;
  const startWork = async (plan: Plan): Promise<Id<"agentRuns">> => {
    const confirmedCredits = plan.maxCredits;
    const target = plan.target;
    if (plan.skill === "pipeline-forensics") return (await pipelineReview({ workspaceId, clientId, confirmedCredits })).runId;
    if (plan.skill === "follow-up-engine") return (await followUps({ workspaceId, clientId, confirmedCredits })).runId;
    if (plan.skill === "deal-briefing" && target?.kind === "call") return (await brief({ workspaceId, clientId, contactRef: target.contactRef, appointmentRef: target.ref, confirmedCredits })).runId;
    if (plan.skill === "conversation-intelligence" && target) {
      return (
        await callReview({
          workspaceId,
          clientId,
          ...(target.kind === "transcript" ? { transcriptId: target.ref as Id<"callTranscripts"> } : { callNoteId: target.ref as Id<"callNotes"> }),
          confirmedCredits,
        })
      ).runId;
    }
    throw new Error("This work cannot be started from the chat.");
  };
  const actions: ChatActions = {
    send: async (text) => {
      const id = await send({ workspaceId, clientId, ...(chatId ? { chatId } : {}), text });
      setChatId(id);
    },
    start: async (plan) => {
      if (!chatId) return;
      const runId = await startWork(plan);
      await started({ workspaceId, chatId, runId });
    },
    open: (id) => setChatId(id as Id<"dealmakerChats"> | null),
  };
  return <DealmakerChatView chat={chatId && chat ? chat : null} list={list} editor={editor} base={base} actions={actions} />;
}
