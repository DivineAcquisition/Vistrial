import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TeamManagement } from "@/components/settings/team-management";

export default async function TeamPage() {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get user's business and role
  let businessId: string | null = null;
  let currentUserRole = "staff";

  // Try business_users first
  const { data: membership } = await supabase
    .from("business_users")
    .select("role, business_id")
    .eq("user_id", user.id)
    .single();

  if (membership) {
    businessId = membership.business_id;
    currentUserRole = membership.role;
  } else {
    // Fallback: check if user owns a business
    const { data: ownedBusiness } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (ownedBusiness) {
      businessId = ownedBusiness.id;
      currentUserRole = "owner";
    }
  }

  if (!businessId) {
    redirect("/onboarding");
  }

  // Get team members
  const { data: members } = await supabase
    .from("business_users")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at");

  // Get pending invitations
  const { data: invitations } = await supabase
    .from("invitations")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (
    <TeamManagement
      businessId={businessId}
      currentUserRole={currentUserRole}
      members={members || []}
      invitations={invitations || []}
    />
  );
}
