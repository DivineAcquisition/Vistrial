import { SupportForm } from "@/app/(workspace)/app/team/support/form";
import { PageFrame } from "@/components/app/page-frame";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { staffDb } from "@/lib/staff/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Support" };

export default async function SupportPage() {
  await requirePlatformAdmin();
  const db = await staffDb();
  const { data } = await db.from("staff_support_settings").select("*").eq("id", true).maybeSingle();
  if (!data) return null;
  return (
    <PageFrame
      title="Support"
      description="Business hours are Monday to Friday, 9 to 6 Eastern, until you change them. A request is flagged after the first target and raised to a Platform Admin after the second."
    >
      <SupportForm settings={data as Record<string, unknown>} />
    </PageFrame>
  );
}
