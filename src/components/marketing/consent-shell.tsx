import { ConsentBanner } from "@/components/marketing/consent-banner";
import { loadTrackingCatalog } from "@/lib/marketing/tracking";

export async function ConsentShell() {
  const catalog = await loadTrackingCatalog();
  return <ConsentBanner version={catalog.settings.version} tools={catalog.tools} />;
}