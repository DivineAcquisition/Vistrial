import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getAuthContext } from "@/lib/auth/session";

export default async function AppHomePage() {
  const { user, org, role, member } = await getAuthContext();

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title={org.name}
        description="Protected app shell. Inbox, case files, and reporting land in later prompts."
      />
      <Panel className="max-w-xl px-6 py-6">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">User</dt>
            <dd className="mt-1 text-white">{member.displayName}</dd>
            <dd className="text-silver">{user.email}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">Active org</dt>
            <dd className="mt-1 text-white">{org.name}</dd>
            <dd className="text-silver">{org.slug}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">Role</dt>
            <dd className="mt-1 capitalize text-white">{role}</dd>
          </div>
        </dl>
      </Panel>
    </>
  );
}
