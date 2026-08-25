import type { ScoringPreviewResult } from "@/lib/settings/preview";
import { helperClass } from "@/lib/ui";

export function ScoringImpactPreview({ preview }: { preview: ScoringPreviewResult | null }) {
  if (!preview) return null;
  return (
    <div className="space-y-3 rounded-2xl border border-white/10 p-4">
      <p className="text-sm text-white">
        {preview.trackChanged} lead{preview.trackChanged === 1 ? "" : "s"} change track.{" "}
        {preview.positionChanged} change queue position.
      </p>
      <p className={helperClass}>
        After this change the queue would hold {preview.readyCount} ready and {preview.nurtureCount}{" "}
        nurture.
      </p>
      {preview.movers.length === 0 ? (
        <p className={helperClass}>No named movers. Rank and track stay put for current open leads.</p>
      ) : (
        <ol className="space-y-2 text-sm text-silver">
          {preview.movers.map((mover) => (
            <li key={mover.id}>
              <span className="text-white">{mover.name}</span>
              {": "}
              {mover.fromTrack.replace("_", " ")} #{mover.fromPosition} → {mover.toTrack.replace("_", " ")} #
              {mover.toPosition}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
