import { ModelMark as Mark, type ModelMarkData } from "@/components/models/model-mark";

/**
 * The place in a result's header for "which model ran": the maker's mark and the model's plain name. It
 * draws nothing for a result that carries no model (work from before models were recorded, or work no
 * model did), so every result header can render this slot.
 */
export function ModelMark({ model }: { model?: ModelMarkData | null }) {
  if (!model) return <span data-slot="model-mark" hidden />;
  return (
    <span data-slot="model-mark" className="inline-flex">
      <Mark model={model} />
    </span>
  );
}
