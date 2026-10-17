import { Notice } from "@/components/ui/states";
import { holdBanner } from "@/lib/connectors/status";
import { unhealthyTools } from "@/lib/connectors/store";

export async function ConnectionHold({ orgId }: { orgId: string }) {
  try {
    const banner = holdBanner(await unhealthyTools(orgId));
    if (!banner) return null;
    return (
      <Notice tone="warning" title="Some data may be out of date">
        {banner}
      </Notice>
    );
  } catch {
    return null;
  }
}
