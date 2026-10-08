import { PageFrame } from "@/components/app/page-frame";
import { InstallMoment } from "@/components/app/install-moment";
import { InstallSteps } from "@/components/app/install-steps";
import { Panel } from "@/components/ui/panel";
import { getAuthContext } from "@/lib/auth/session";

export default async function InstallPage() {
  await getAuthContext();

  return (
    <PageFrame
      title="Install Vistrial"
      description="Add it to the home screen so logging an outcome is one tap between calls."
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Panel className="space-y-4 p-6">
          <InstallSteps />
        </Panel>
        <InstallMoment />
      </div>
    </PageFrame>
  );
}
