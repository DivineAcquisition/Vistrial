"use client";

import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useComposerRuntime,
} from "@assistant-ui/react";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CopyIcon, RotateCcwIcon, SquareIcon, XIcon } from "lucide-react";
import { useEffect, useRef, type FC, type ReactNode } from "react";

import { MarkdownText } from "@/components/assistant-ui/elements/markdown-text";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { useCompassChat } from "@/components/compass/chat";
import { AnswerFeedback, AnswerNotes, AnswerSources, LookupStep, SuggestionCard } from "@/components/compass/parts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The Compass conversation. Adapted from the shared thread: answers can be
 * copied, rated and retried, never edited or branched, and each answer ends
 * with the records it was built from.
 */

export type CompassThreadProps = {
  welcome?: ReactNode;
  placeholder?: string;
  /** Shown above the composer: what this conversation is about, removable. */
  contextChip?: { label: string; onRemove: () => void } | null;
  /** Prefills the composer once, for links like /app/compass?q=... */
  prefill?: string | null;
  compact?: boolean;
  autoFocus?: boolean;
};

export const CompassThread: FC<CompassThreadProps> = ({ welcome, placeholder, contextChip, prefill, compact = false, autoFocus = true }) => {
  const isEmpty = useAuiState((s) => s.thread.messages.length === 0);
  const { readOnly } = useCompassChat();
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full min-h-0 flex-col bg-background"
      style={{
        ["--thread-max-width" as string]: compact ? "100%" : "46rem",
        ["--composer-bg" as string]: "var(--color-card)",
        ["--composer-radius" as string]: "1rem",
        ["--composer-padding" as string]: "8px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth"
      >
        <div className={cn("mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col pt-6", compact ? "px-3" : "px-4", isEmpty && "justify-center")}>
          {isEmpty ? welcome : null}

          <div className="mb-10 flex flex-col gap-y-6 empty:hidden">
            <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter
            className={cn("flex flex-col gap-3 overflow-visible bg-background pb-4 md:pb-6", !isEmpty && "sticky bottom-0 mt-auto rounded-t-(--composer-radius)")}
          >
            <ThreadPrimitive.ScrollToBottom asChild>
              <TooltipIconButton
                tooltip="Scroll to the latest"
                variant="outline"
                className="absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
              >
                <ArrowDownIcon />
              </TooltipIconButton>
            </ThreadPrimitive.ScrollToBottom>
            <ChatError />
            <LiveStatus />
            {readOnly ? (
              <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                This is an earlier conversation from before Compass. You can read or delete it, but not continue it.
              </p>
            ) : (
              <Composer placeholder={placeholder} contextChip={contextChip ?? null} prefill={prefill ?? null} autoFocus={autoFocus} />
            )}
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  return role === "user" ? <UserMessage /> : <AssistantMessage />;
};

/** Said once to screen readers: when Compass starts and finishes, not every word. */
const LiveStatus: FC = () => {
  const { chat } = useCompassChat();
  const text = chat.status === "submitted" ? "Compass is looking this up." : chat.status === "streaming" ? "Compass is answering." : "";
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {text}
    </p>
  );
};

const ChatError: FC = () => {
  const { chat, retry, sampleError } = useCompassChat();
  const message = chat.error?.message || sampleError;
  if (!message) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-card-foreground" role="alert">
      <span className="min-w-0 flex-1">{message}</span>
      <Button size="xs" variant="outline" onClick={() => retry()}>
        <RotateCcwIcon aria-hidden />
        Try again
      </Button>
    </div>
  );
};

const Composer: FC<{ placeholder?: string; contextChip: CompassThreadProps["contextChip"]; prefill: string | null; autoFocus: boolean }> = ({
  placeholder = "Ask about your leads, calls and numbers",
  contextChip,
  prefill,
  autoFocus,
}) => {
  const composer = useComposerRuntime();
  const filled = useRef(false);
  useEffect(() => {
    if (prefill && !filled.current) {
      filled.current = true;
      composer.setText(prefill.slice(0, 2000));
    }
  }, [composer, prefill]);

  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col">
      <div className="flex w-full cursor-text flex-col gap-2 rounded-(--composer-radius) border border-border bg-(--composer-bg) p-(--composer-padding) shadow-xs transition-[border-color] focus-within:border-brand-500/55">
        {contextChip ? (
          <div className="flex">
            <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-brand-500/10 py-0.5 ps-2 pe-0.5 text-xs text-card-foreground">
              <span className="truncate">About: {contextChip.label}</span>
              <button
                type="button"
                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Stop asking about ${contextChip.label}`}
                onClick={contextChip.onRemove}
              >
                <XIcon className="size-3.5" aria-hidden />
              </button>
            </span>
          </div>
        ) : null}
        <ComposerPrimitive.Input
          placeholder={placeholder}
          className="max-h-48 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base leading-6 text-card-foreground caret-primary outline-none placeholder:text-muted-foreground/70"
          rows={1}
          autoFocus={autoFocus}
          enterKeyHint="send"
          maxLength={2000}
          aria-label="Question for Compass"
        />
        <div className="flex items-center justify-end">
          <AuiIf condition={(s) => !s.composer.canCancel}>
            <ComposerPrimitive.Send asChild>
              <TooltipIconButton tooltip="Ask" side="bottom" type="button" variant="default" size="icon" className="size-8 rounded-full" aria-label="Ask Compass">
                <ArrowUpIcon className="size-4" />
              </TooltipIconButton>
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(s) => s.composer.canCancel}>
            <ComposerPrimitive.Cancel asChild>
              <Button type="button" variant="default" size="icon" className="size-8 rounded-full" aria-label="Stop answering">
                <SquareIcon className="size-3.5 fill-current" />
              </Button>
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
};

const AssistantMessage: FC = () => {
  const messageId = useAuiState((s) => s.message.id);
  const running = useAuiState((s) => s.message.status?.type === "running");
  const { metaFor, readOnly } = useCompassChat();
  const meta = metaFor(messageId);
  return (
    <MessagePrimitive.Root data-role="assistant" className="fade-in slide-in-from-bottom-1 animate-in relative duration-150">
      <div className="flex flex-col gap-3 px-2 leading-relaxed text-card-foreground wrap-break-word">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            tools: { by_name: { suggest_action: SuggestionCard }, Fallback: LookupStep },
          }}
        />
        {!running && meta ? (
          <>
            <AnswerNotes meta={meta} />
            <AnswerSources sources={meta.sources} />
          </>
        ) : null}
      </div>
      {!running ? (
        <div className="ms-2 flex min-h-7.5 flex-wrap items-center gap-1 pt-1.5 text-muted-foreground">
          <ActionBarPrimitive.Root className="-ms-1 flex gap-1">
            <ActionBarPrimitive.Copy asChild>
              <TooltipIconButton tooltip="Copy">
                <AuiIf condition={(s) => s.message.isCopied}>
                  <CheckIcon />
                </AuiIf>
                <AuiIf condition={(s) => !s.message.isCopied}>
                  <CopyIcon />
                </AuiIf>
              </TooltipIconButton>
            </ActionBarPrimitive.Copy>
          </ActionBarPrimitive.Root>
          {!readOnly && meta ? <AnswerFeedback messageId={messageId} /> : null}
        </div>
      ) : null}
    </MessagePrimitive.Root>
  );
};

const UserMessage: FC = () => (
  <MessagePrimitive.Root
    data-role="user"
    className="fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [&:where(>*)]:col-start-2"
  >
    <div className="relative col-start-2 min-w-0">
      <div className="rounded-(--composer-radius) bg-brand-500/10 px-4 py-2 text-card-foreground wrap-break-word empty:hidden">
        <MessagePrimitive.Parts />
      </div>
    </div>
  </MessagePrimitive.Root>
);
