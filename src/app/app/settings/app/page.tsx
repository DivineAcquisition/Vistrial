import { PageFrame } from "@/components/app/page-frame";
import { InstallSteps } from "@/components/app/install-steps";
import { PushEnable } from "@/components/app/push-enable";
import { Card } from "@/components/ui/card";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { helperClass } from "@/lib/ui";

export default function AppSettingsPage() {
  return (
    <PageFrame
      title="App"
      description="Install this workspace on a phone, and the push permission this device has granted."
    >
      <div className="space-y-10">
        <section>
          <SectionHeader
            title="Install to the home screen"
            hint="Each platform is different. Follow the steps for the phone you are holding."
          />
          <Panel className="p-6">
            <InstallSteps />
          </Panel>
        </section>
        <section>
          <SectionHeader
            title="Push on this device"
            hint="Push is the default for anything with a clock on it. It never fires for something already on your screen."
          />
          <Card className="max-w-xl p-6">
            <p className={helperClass}>The switch below is this browser's permission, not a stored setting.</p>
            <div className="mt-4">
              <PushEnable />
            </div>
          </Card>
        </section>
      </div>
    </PageFrame>
  );
}
