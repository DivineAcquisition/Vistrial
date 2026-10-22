import type { SupabaseClient } from "@supabase/supabase-js";

import { PageFrame } from "@/components/app/page-frame";
import { FoundationEditor } from "@/app/(workspace)/app/foundation/foundation-editor";
import { loadFoundation } from "@/lib/foundation/store";
import { requireSalesOs } from "@/lib/sales-os/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Foundation" };

export default async function FoundationPage() {
  const ctx = await requireSalesOs();
  const db = (await createClient()) as unknown as SupabaseClient;
  const state = await loadFoundation(db, ctx.org.id);
  const canEdit = ctx.workspaceRole === "owner" || ctx.isStaff;

  return (
    <PageFrame
      title="Foundation"
      description="What the business is trying to achieve. Every agent reads it, and only confirmed fields are used."
      status={state.version ? `Version ${state.version.version}` : "Not confirmed yet"}
      statusTone={state.version ? "good" : "warning"}
    >
      <FoundationEditor
        fields={[...state.fields.values()]}
        canEdit={canEdit}
        canConfirm={ctx.workspaceRole === "owner"}
        version={state.version}
      />
    </PageFrame>
  );
}
