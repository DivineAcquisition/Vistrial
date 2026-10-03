"use client";

import { useChat } from "@ai-sdk/react";
import {
  AssistantRuntimeProvider,
  RuntimeAdapterProvider,
  useAui,
  useAuiState,
  useRemoteThreadListRuntime,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { createAssistantStream } from "assistant-stream";
import { useMemo, type PropsWithChildren } from "react";

import {
  archiveConversationAction,
  createConversationAction,
  fetchConversationAction,
  listConversationsAction,
  loadConversationMessagesAction,
  renameConversationAction,
  unarchiveConversationAction,
} from "@/app/app/ask/actions";

/**
 * Messages are persisted by the server as they stream, so the browser never
 * writes history. It loads it, and sends only the newest message.
 */
function HistoryProvider({ children }: PropsWithChildren) {
  const aui = useAui();
  const history = useMemo<ThreadHistoryAdapter>(
    () => ({
      load: async () => ({ messages: [] }),
      append: async () => {},
      withFormat: <TMessage,>() => ({
        load: async () => {
          const remoteId = aui.threadListItem.source ? aui.threadListItem().getState().remoteId : undefined;
          if (!remoteId) return { messages: [] };
          const messages = await loadConversationMessagesAction(remoteId);
          return {
            headId: messages.at(-1)?.id ?? null,
            messages: messages.map((message, index) => ({
              parentId: index === 0 ? null : messages[index - 1].id,
              message: message as unknown as TMessage,
            })),
          };
        },
        append: async () => {},
        update: async () => {},
      }),
    }),
    [aui]
  );
  return <RuntimeAdapterProvider adapters={{ history }}>{children}</RuntimeAdapterProvider>;
}

function useThreadListAdapter(): RemoteThreadListAdapter {
  return useMemo<RemoteThreadListAdapter>(
    () => ({
      list: async () => {
        const rows = await listConversationsAction();
        return {
          threads: rows.map((row) => ({
            status: row.status,
            remoteId: row.id,
            title: row.title ?? undefined,
            lastMessageAt: row.lastMessageAt ? new Date(row.lastMessageAt) : undefined,
          })),
        };
      },
      initialize: async () => ({ remoteId: await createConversationAction() }),
      rename: (remoteId, title) => renameConversationAction(remoteId, title),
      archive: (remoteId) => archiveConversationAction(remoteId),
      unarchive: (remoteId) => unarchiveConversationAction(remoteId),
      delete: async () => {
        throw new Error("Conversations are kept so anyone can check what Vistrial did. Archive it instead.");
      },
      generateTitle: async (remoteId) =>
        createAssistantStream(async (controller) => {
          const row = await fetchConversationAction(remoteId);
          if (row?.title) controller.appendText(row.title);
        }),
      fetch: async (remoteId) => {
        const row = await fetchConversationAction(remoteId);
        if (!row) throw new Error("That conversation isn't available.");
        return {
          status: row.status,
          remoteId: row.id,
          title: row.title ?? undefined,
          lastMessageAt: row.lastMessageAt ? new Date(row.lastMessageAt) : undefined,
        };
      },
      unstable_Provider: HistoryProvider,
    }),
    []
  );
}

function useConversationRuntime() {
  const aui = useAui();
  const id = useAuiState((s) => s.threadListItem.id);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/sales-os/chat",
        prepareSendMessagesRequest: async ({ messages, trigger }) => {
          const item = aui.threadListItem.source ? aui.threadListItem() : null;
          const remoteId = item ? (await item.initialize()).remoteId : null;
          return { body: { id: remoteId, message: messages.at(-1), trigger } };
        },
      }),
    [aui]
  );
  const chat = useChat({
    id,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  return useAISDKRuntime(chat);
}

export function SalesOsRuntimeProvider({
  children,
  threadId,
  onThreadIdChange,
}: PropsWithChildren<{ threadId?: string; onThreadIdChange?: (id: string | undefined) => void }>) {
  const adapter = useThreadListAdapter();
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: function SalesOsThreadRuntime() {
      return useConversationRuntime();
    },
    adapter,
    threadId,
    onThreadIdChange,
  });
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
