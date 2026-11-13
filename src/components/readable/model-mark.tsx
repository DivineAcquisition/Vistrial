import { BotIcon } from "@/components/icons";

/**
 * The place in a result's header for "which model ran". It draws nothing until a result carries a model name:
 * the model picker and the saved model belong to another piece of work (branch claude/models-openrouter).
 * Whoever lands that only has to pass `model` here; every result header already renders this slot.
 */
export function ModelMark({ model }: { model?: string | null }) {
  if (!model) return <span data-slot="model-mark" hidden />;
  return (
    <span data-slot="model-mark" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <BotIcon aria-hidden className="size-3.5" />
      <span className="sr-only">Model: </span>
      {model}
    </span>
  );
}
