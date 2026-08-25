import { PageFrame } from "@/components/app/page-frame";
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
      <Panel className="space-y-4 p-6">
        <InstallSteps />
      </Panel>
    </PageFrame>
  );
}
