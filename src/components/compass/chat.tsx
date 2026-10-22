"use client";

import { useChat } from "@ai-sdk/react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { DefaultChatTransport, type UIMessage } from "ai";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

import { createConversationAction } from "@/app/(workspace)/app/compass/actions";
import { parseAgentIntent, type AgentIntent } from "@/lib/agent-elements/intent";
import type { CompassAnswerMeta, CompassContext } from "@/lib/compass/types";

/**
 * One Compass conversation in the browser. The server saves every message as
 * it streams, so the browser sends only the newest question, with the
 * conversation id and what the person is looking at.
 */

type CompassChat = ReturnType<typeof useChat<UIMessage>>;

type CompassChatValue = {
  chat: CompassChat;
  conversationId: () => string | null;
  /** Asks the last question again after a failed answer. */
  retry: () => void;
  ask: (text: string) => void;
  metaFor: (messageId: string) => CompassAnswerMeta | null;
  readOnly: boolean;
  /** Layout samples only: an error to show without a request. */
  sampleError: string | null;
  sample: boolean;
  intent: AgentIntent;
  setIntent: (intent: AgentIntent) => void;
};

const CompassChatContext = createContext<CompassChatValue | null>(null);

export function useCompassChat(): CompassChatValue {
  const value = useContext(CompassChatContext);
  if (!value) throw new Error("useCompassChat is used outside CompassChatProvider.");
  return value;
}

/** The sentence a person reads when a request fails. Never a stack trace. */
export function compassErrorMessage(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "Compass couldn't answer just now. Nothing was changed. Try again.";
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error.trim();
  } catch {
    // Already a sentence.
  }
  return trimmed.length < 300 ? trimmed : "Compass couldn't answer just now. Nothing was changed. Try again.";
}

function textOf(message: UIMessage | undefined): string {
  if (!message) return "";
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

export function CompassChatProvider({
  chatKey,
  conversationId,
  initialMessages,
  origin,
  context,
  readOnly = false,
  sample = false,
  sampleError = null,
  initialIntent = "lookup",
  onConversation,
  onSettled,
  children,
}: PropsWithChildren<{
  /** Stays the same for the life of one conversation on screen, even before it has an id. */
  chatKey: string;
  conversationId: string | null;
  initialMessages: UIMessage[];
  origin: "page" | "panel";
  context: CompassContext;
  readOnly?: boolean;
  /** A layout sample: nothing is ever sent. */
  sample?: boolean;
  sampleError?: string | null;
  initialIntent?: AgentIntent;
  onConversation?: (id: string) => void;
  /** After each answer finishes or fails, so lists can pick up the new title. */
  onSettled?: (messageCount: number) => void;
}>) {
  // What the transport reads when it sends. Refs, so a new id or context never rebuilds the chat.
  const idRef = useRef<string | null>(conversationId);
  const contextRef = useRef<CompassContext>(context);
  const [intent, setIntentState] = useState<AgentIntent>(parseAgentIntent(initialIntent));
  const intentRef = useRef(intent);
  const setIntent = useCallback((next: AgentIntent) => {
    intentRef.current = next;
    setIntentState(next);
  }, []);
  const onConversationRef = useRef(onConversation);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    intentRef.current = intent;
    contextRef.current = context;
    onConversationRef.current = onConversation;
    onSettledRef.current = onSettled;
  }, [intent, context, onConversation, onSettled]);

  const transport = useMemo(
    () =>
      // The refs are read only when a message is sent, never while rendering.
      // eslint-disable-next-line react-hooks/refs
      new DefaultChatTransport<UIMessage>({
        api: "/api/compass/chat",
        fetch: async (input, init) => {
          if (sample) throw new Error("This is a sample. Nothing is sent.");
          const response = await globalThis.fetch(input, init);
          if (!response.ok) throw new Error(compassErrorMessage(await response.text()));
          return response;
        },
        prepareSendMessagesRequest: async ({ messages }) => {
          if (!idRef.current) {
            idRef.current = await createConversationAction(origin, contextRef.current);
            onConversationRef.current?.(idRef.current);
          }
          return { body: { id: idRef.current, message: messages.at(-1), trigger: "submit-message", context: contextRef.current, intent: intentRef.current } };
        },
      }),
    [origin, sample]
  );

  const chat = useChat<UIMessage>({ id: chatKey, messages: initialMessages, transport });
  const runtime = useAISDKRuntime(chat);

  const { messages, setMessages, sendMessage, status } = chat;

  const wasBusy = useRef(false);
  useEffect(() => {
    const busy = status === "submitted" || status === "streaming";
    if (wasBusy.current && !busy) onSettledRef.current?.(messages.length);
    wasBusy.current = busy;
  }, [status, messages.length]);
  const retry = useCallback(() => {
    if (status === "streaming" || status === "submitted") return;
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    const text = textOf(lastUser);
    if (!lastUser || !text) return;
    const at = messages.lastIndexOf(lastUser);
    setMessages(messages.slice(0, at));
    void sendMessage({ text });
  }, [messages, setMessages, sendMessage, status]);

  const ask = useCallback(
    (text: string) => {
      if (readOnly || !text.trim() || status === "streaming" || status === "submitted") return;
      void sendMessage({ text: text.trim() });
    },
    [readOnly, sendMessage, status]
  );

  const metaFor = useCallback(
    (messageId: string) => {
      const message = messages.find((item) => item.id === messageId);
      const meta = message?.metadata as CompassAnswerMeta | undefined;
      return meta && Array.isArray(meta.sources) ? meta : null;
    },
    [messages]
  );

  const value = useMemo<CompassChatValue>(
    () => ({ chat, conversationId: () => idRef.current, retry, ask, metaFor, readOnly, sampleError, sample, intent, setIntent }),
    [chat, retry, ask, metaFor, readOnly, sampleError, sample, intent, setIntent]
  );

  return (
    <CompassChatContext.Provider value={value}>
      <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
    </CompassChatContext.Provider>
  );
}
