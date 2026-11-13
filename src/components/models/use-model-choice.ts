"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import type { ModelSwitchProps } from "@/components/models/model-switch";
import { showError } from "@/lib/errors/show-error";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * The model choice for one piece of work a person is about to start. Until they pick, it shows what the
 * work would run on anyway: the model they last chose for this kind of work, else the platform's. `picked`
 * is sent to the server only when the person chose by hand; the server then remembers it for next time.
 */
export function useModelChoice(workspaceId: Id<"workspaces">, skillSlug?: string) {
  const options = useQuery(api.models.options, { workspaceId, ...(skillSlug ? { skillSlug } : {}) });
  const [chosen, setChosen] = useState<string | null>(null);
  // A pick that the work in front of the person cannot run on (they switched to research) falls away.
  const picked = chosen && options?.models.some((row) => row.id === chosen) ? chosen : null;
  const props: ModelSwitchProps | null = options
    ? { options: options.models, value: picked ?? options.current, onChange: setChosen, locked: !options.canChoose }
    : null;
  return { picked, props, reset: () => setChosen(null) };
}

/**
 * The model switch of a conversation that already exists. A pick is saved on the conversation at once, and
 * is refused by the server, with the reason shown, if that model cannot run the skill the chat is on. Once
 * the work has started the switch only shows what it ran on.
 */
export function useConversationModel(
  workspaceId: Id<"workspaces">,
  chat: { id: Id<"intakes">; route: string | null; model: string | null; started: boolean } | null,
): ModelSwitchProps | null {
  const options = useQuery(api.models.options, chat ? { workspaceId, ...(chat.route ? { skillSlug: chat.route } : {}) } : "skip");
  const setModel = useMutation(api.agentChat.setModel);
  if (!chat || !options) return null;
  return {
    options: options.models,
    value: chat.model ?? options.current,
    locked: chat.started || !options.canChoose,
    onChange: (model) => void setModel({ workspaceId, intakeId: chat.id, model }).catch((error: unknown) => void showError(error, "The model was not changed.")),
  };
}
