import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

export default function SettingsPage() {
  return (
    <>
      <SectionHeader title="SETTINGS" />
      <Card className="px-4 py-4">
        <p className="text-sm text-dim">Settings arrive in a later prompt.</p>
      </Card>
    </>
  );
}
