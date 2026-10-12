import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ConfirmContactButton } from "@/app/(workspace)/app/onboarding/confirm-contact/[id]/confirm-button";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { Notice } from "@/components/ui/states";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Escalation test" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where an escalation contact lands from their test notification. Only they can confirm it. */
export default async function ConfirmContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data } = await db
    .from("workspace_escalation_contacts")
    .select("id, member_id, verified_at, channel")
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  const contact = data as { id: string; member_id: string | null; verified_at: string | null; channel: string } | null;
  if (!contact || contact.member_id !== ctx.member.id) notFound();

  return (
    <PageFrame title="You are an escalation contact" description="This was a test. No lead is waiting.">
      <Panel className="p-6">
        <p className="text-sm text-white">
          When a lead waits too long and nobody has responded, Vistrial tells you. This confirms the message reached you.
        </p>
        <p className={helperClass}>You can change how you hear about things in your notification settings.</p>
        <div className="mt-5">
          {contact.verified_at ? (
            <Notice tone="success" title="Confirmed">
              <p className={helperClass}>Thanks. You are all set.</p>
            </Notice>
          ) : (
            <ConfirmContactButton contactId={contact.id} />
          )}
        </div>
      </Panel>
    </PageFrame>
  );
}
