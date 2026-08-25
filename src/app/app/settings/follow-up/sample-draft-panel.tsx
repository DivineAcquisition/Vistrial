import type { VoiceSamplePreview } from "@/lib/settings/sample";
import { helperClass } from "@/lib/ui";

export function SampleDraftPanel({ preview }: { preview: VoiceSamplePreview | null }) {
  if (!preview) {
    return (
      <p className={helperClass}>
        Save voice examples to refresh a sample draft from a real recent lead.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className={helperClass}>
        Sample draft for {preview.leadName}
        {preview.generatedAt
          ? `, refreshed ${new Date(preview.generatedAt).toLocaleString()}`
          : ""}
        . This is what the current examples produce, not a live send.
      </p>
      <p className="whitespace-pre-wrap text-sm text-silver">{preview.body}</p>
    </div>
  );
}
