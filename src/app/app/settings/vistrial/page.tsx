import { PageFrame } from "@/components/app/page-frame";
import { SalesOsSettingsForm } from "@/components/sales-os/settings-form";
import { Notice } from "@/components/ui/states";
import { salesOsActor } from "@/lib/sales-os/session";
import { loadManagers, loadSalesOsSettings } from "@/lib/sales-os/settings";

const DRIVE_FLASH: Record<string, { tone: "success" | "warning" | "critical"; text: string }> = {
  connected: { tone: "success", text: "Google Drive is connected. Vistrial made a folder called Vistrial for your assets." },
  cancelled: { tone: "warning", text: "Google Drive wasn't connected. Nothing changed." },
  expired: { tone: "warning", text: "That connection attempt expired. Start it again from here." },
  not_allowed: { tone: "critical", text: "Only an owner or admin of this workspace can connect Google Drive." },
  failed: { tone: "critical", text: "Google Drive couldn't be connected. Nothing was changed in your Drive." },
};

export default async function VistrialSettingsPage({ searchParams }: { searchParams: Promise<{ drive?: string }> }) {
  const actor = await salesOsActor();
  const [settings, managers, query] = await Promise.all([loadSalesOsSettings(actor), loadManagers(actor), searchParams]);
  const flash = query.drive ? DRIVE_FLASH[query.drive] : null;
  return (
    <PageFrame
      title="Posting and approvals"
      description="What Vistrial may post or save outside Vistrial, where it goes, and what waits for your OK."
    >
      {flash ? <Notice tone={flash.tone}>{flash.text}</Notice> : null}
      <SalesOsSettingsForm settings={settings} managers={managers} />
    </PageFrame>
  );
}
