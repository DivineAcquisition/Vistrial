import { PageFrame } from "@/components/app/page-frame";
import { NewOrgForm } from "@/app/ops/orgs/new/new-org-form";
import { getStaffContext } from "@/lib/auth/staff";

export default async function NewOrgPage() {
  await getStaffContext();
  return (
    <PageFrame
      title="New organization"
      description="Name and timezone first. The client owner is invited; they still walk setup."
    >
      <NewOrgForm />
    </PageFrame>
  );
}
