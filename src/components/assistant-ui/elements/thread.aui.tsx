"use client";

import { MarkdownText } from "@/components/assistant-ui/elements/markdown-text";
import { ToolCallGroup } from "@/components/sales-os/tool-call";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ActionBarPrimitive,
  AuiIf,
  type AssistantState,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type ToolCallMessagePartComponent,
  useAuiState,
} from "@assistant-ui/react";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CopyIcon, SquareIcon } from "lucide-react";
import { createContext, useContext, type ComponentType, type FC } from "react";

/**
 * Adapted from the assistant-ui CLI thread for @assistant-ui/react 0.14.
 * Conversations here are a record of what happened, so editing a sent
 * message, regenerating an answer, and branching are left out.
 */
export type ThreadComponents = {
  Welcome?: ComponentType | undefined;
  ToolFallback?: ToolCallMessagePartComponent | undefined;
  placeholder?: string | undefined;
};

export type ThreadProps = {
  components?: ThreadComponents | undefined;
  autoFocus?: boolean | undefined;
};

const EMPTY_COMPONENTS: ThreadComponents = {};
const ThreadComponentsContext = createContext<ThreadComponents>(EMPTY_COMPONENTS);

const isNewChatView = (s: AssistantState) => s.thread.messages.length === 0 && (!s.thread.isLoading || s.threads.isLoading);

const isHistoryLoadingView = (s: AssistantState) =>
  s.thread.messages.length === 0 && s.thread.isLoading && !s.thread.isDisabled && !s.threads.isLoading;

const ThreadHistorySkeleton: FC = () => (
  <div
    data-slot="aui_thread-history-skeleton"
    role="status"
    className="animate-in fade-in fill-mode-both flex flex-col gap-y-6 [animation-delay:150ms] [animation-duration:200ms]"
  >
    <span className="sr-only">Loading conversation</span>
    <Skeleton className="ml-auto h-9 w-2/5 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-11/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-4/5 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-3/5 motion-reduce:animate-none" />
    </div>
  </div>
);

export const Thread: FC<ThreadProps> = ({ components = EMPTY_COMPONENTS, autoFocus = true }) => {
  const isEmpty = useAuiState(isNewChatView);
  return (
    <ThreadComponentsContext.Provider value={components}>
      <ThreadRoot isEmpty={isEmpty} autoFocus={autoFocus} />
    </ThreadComponentsContext.Provider>
  );
};

const ThreadRoot: FC<{ isEmpty: boolean; autoFocus: boolean }> = ({ isEmpty, autoFocus }) => {
  const { Welcome } = useContext(ThreadComponentsContext);
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-background"
      style={{
        ["--thread-max-width" as string]: "46rem",
        ["--composer-bg" as string]: "var(--color-card)",
        ["--composer-radius" as string]: "1rem",
        ["--composer-padding" as string]: "8px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-scroll scroll-smooth"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-6",
            isEmpty && "justify-center"
          )}
        >
          {Welcome ? (
            <AuiIf condition={isNewChatView}>
              <Welcome />
            </AuiIf>
          ) : null}
          <AuiIf condition={isHistoryLoadingView}>
            <ThreadHistorySkeleton />
          </AuiIf>

          <div data-slot="aui_message-group" className="mb-14 flex flex-col gap-y-6 empty:hidden">
            <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter
            className={cn(
              "aui-thread-viewport-footer flex flex-col gap-4 overflow-visible bg-background pb-4 md:pb-6",
              !isEmpty && "sticky bottom-0 mt-auto rounded-t-(--composer-radius)"
            )}
          >
            <ThreadScrollToBottom />
            <Composer autoFocus={autoFocus} />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  if (role === "user") return <UserMessage />;
  return <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => (
  <ThreadPrimitive.ScrollToBottom asChild>
    <TooltipIconButton
      tooltip="Scroll to the latest"
      variant="outline"
      className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
    >
      <ArrowDownIcon />
    </TooltipIconButton>
  </ThreadPrimitive.ScrollToBottom>
);

const Composer: FC<{ autoFocus: boolean }> = ({ autoFocus }) => {
  const { placeholder = "Ask about your leads, calls, and what to do next" } = useContext(ThreadComponentsContext);
  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <div
        data-slot="aui_composer-shell"
        className="flex w-full cursor-text flex-col gap-2 rounded-(--composer-radius) border border-border bg-(--composer-bg) p-(--composer-padding) shadow-xs transition-[border-color] focus-within:border-brand-500/55"
      >
        <ComposerPrimitive.Input
          placeholder={placeholder}
          className="aui-composer-input max-h-48 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base leading-6 text-card-foreground caret-primary outline-none placeholder:text-muted-foreground/70"
          rows={1}
          autoFocus={autoFocus}
          enterKeyHint="send"
          aria-label="Message to Vistrial"
        />
        <ComposerAction />
      </div>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC = () => (
  <div className="aui-composer-action-wrapper relative flex items-center justify-end">
    <AuiIf condition={(s) => !s.composer.canCancel}>
      <ComposerPrimitive.Send asChild>
        <TooltipIconButton
          tooltip="Send"
          side="bottom"
          type="button"
          variant="default"
          size="icon"
          className="aui-composer-send size-8 rounded-full"
          aria-label="Send message"
        >
          <ArrowUpIcon className="aui-composer-send-icon size-4" />
        </TooltipIconButton>
      </ComposerPrimitive.Send>
    </AuiIf>
    <AuiIf condition={(s) => s.composer.canCancel}>
      <ComposerPrimitive.Cancel asChild>
        <Button type="button" variant="default" size="icon" className="aui-composer-cancel size-8 rounded-full" aria-label="Stop">
          <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
        </Button>
      </ComposerPrimitive.Cancel>
    </AuiIf>
  </div>
);

const MessageError: FC = () => (
  <MessagePrimitive.Error>
    <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      <ErrorPrimitive.Message className="aui-message-error-message line-clamp-3" />
    </ErrorPrimitive.Root>
  </MessagePrimitive.Error>
);

const AssistantMessage: FC = () => {
  const { ToolFallback } = useContext(ThreadComponentsContext);
  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="fade-in slide-in-from-bottom-1 animate-in relative duration-150"
    >
      <div data-slot="aui_assistant-message-content" className="flex flex-col gap-3 px-2 leading-relaxed text-card-foreground wrap-break-word">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            tools: ToolFallback ? { Fallback: ToolFallback } : undefined,
            ToolGroup: ToolCallGroup,
          }}
        />
        <MessageError />
      </div>
      <div data-slot="aui_assistant-message-footer" className="ms-2 flex min-h-7.5 items-center pt-1.5">
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => (
  <ActionBarPrimitive.Root
    hideWhenRunning
    autohide="not-last"
    className="aui-assistant-action-bar-root -ms-1 flex gap-1 text-muted-foreground animate-in fade-in duration-200"
  >
    <ActionBarPrimitive.Copy asChild>
      <TooltipIconButton tooltip="Copy">
        <AuiIf condition={(s) => s.message.isCopied}>
          <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
        </AuiIf>
        <AuiIf condition={(s) => !s.message.isCopied}>
          <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
        </AuiIf>
      </TooltipIconButton>
    </ActionBarPrimitive.Copy>
  </ActionBarPrimitive.Root>
);

const UserMessage: FC = () => (
  <MessagePrimitive.Root
    data-slot="aui_user-message-root"
    className="fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [&:where(>*)]:col-start-2"
    data-role="user"
  >
    <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
      <div className="aui-user-message-content rounded-(--composer-radius) bg-brand-500/10 px-4 py-2 text-card-foreground wrap-break-word empty:hidden">
        <MessagePrimitive.Parts />
      </div>
    </div>
  </MessagePrimitive.Root>
);
