"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================
// TYPES
// ============================================

export interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  businessName: string;
  phone?: string;
}

export interface SignInData {
  email: string;
  password: string;
}

export interface InviteUserData {
  email: string;
  role: "admin" | "staff";
  businessId: string;
}

// ============================================
// SIGNUP - Create User + Business
// ============================================

export async function signUp(data: SignUpData) {
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        first_name: data.firstName,
        last_name: data.lastName,
        business_name: data.businessName,
        phone: data.phone,
      },
    },
  });

  if (authError) {
    console.error("Auth signup error:", authError);
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "Failed to create user" };
  }

  const userId = authData.user.id;

  // 2. Generate unique slug
  let slug = data.businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  // Check for uniqueness and append if needed
  const { data: existingBusiness } = await admin
    .from("businesses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existingBusiness) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  // 3. Create business record
  const { data: business, error: businessError } = await admin
    .from("businesses")
    .insert({
      owner_id: userId,
      name: data.businessName,
      slug,
      email: data.email,
      phone: data.phone || null,
      onboarding_completed: false,
      onboarding_step: 1,
    })
    .select()
    .single();

  if (businessError) {
    console.error("Business creation error:", businessError);
    // Try to create in profiles table as fallback
    const { error: profileError } = await admin
      .from("profiles")
      .upsert({
        id: userId,
        email: data.email,
        full_name: `${data.firstName} ${data.lastName}`,
        business_name: data.businessName,
        business_slug: slug,
        phone: data.phone || null,
        onboarding_completed: false,
      });
    
    if (profileError) {
      console.error("Profile creation error:", profileError);
    }
  } else if (business) {
    // 4. Add owner as business_user
    const { error: memberError } = await admin.from("business_users").insert({
      business_id: business.id,
      user_id: userId,
      role: "owner",
      display_name: `${data.firstName} ${data.lastName}`,
      joined_at: new Date().toISOString(),
    });

    if (memberError) {
      console.error("Business user creation error:", memberError);
    }

    // 5. Create user profile
    await admin.from("user_profiles").upsert({
      id: userId,
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone || null,
    });
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

// ============================================
// SIGNIN
// ============================================

export async function signIn(data: SignInData, redirectTo?: string) {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  if (error) {
    console.error("Auth signin error:", error);
    return { error: error.message };
  }

  // Update last active
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("business_users")
      .update({ last_active_at: new Date().toISOString() })
      .eq("user_id", user.id);
  }

  revalidatePath("/", "layout");
  redirect(redirectTo || "/dashboard");
}

// ============================================
// SIGNOUT
// ============================================

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

// ============================================
// PASSWORD RESET
// ============================================

export async function requestPasswordReset(email: string) {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function updatePassword(password: string) {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// ============================================
// TEAM INVITATIONS
// ============================================

export async function inviteTeamMember(data: InviteUserData) {
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  // Verify current user has permission
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Check if user is owner or admin of the business
  const { data: membership } = await supabase
    .from("business_users")
    .select("role")
    .eq("business_id", data.businessId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "You don't have permission to invite users" };
  }

  // Check for existing pending invite
  const { data: existingInvite } = await admin
    .from("invitations")
    .select("id")
    .eq("business_id", data.businessId)
    .eq("email", data.email)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite) {
    return { error: "An invitation has already been sent to this email" };
  }

  // Generate token
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");

  // Create invitation
  const { error: inviteError } = await admin.from("invitations").insert({
    business_id: data.businessId,
    invited_by: user.id,
    email: data.email,
    role: data.role,
    token,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (inviteError) {
    console.error("Invitation error:", inviteError);
    return { error: "Failed to create invitation" };
  }

  // Log invite link (in production, send email)
  console.log(`Invitation link: ${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`);

  revalidatePath("/settings/team");
  return { success: true, token };
}

export async function acceptInvitation(token: string, password?: string) {
  const admin = createAdminClient();
  const supabase = await createServerSupabaseClient();

  // Get invitation
  const { data: invitation, error: inviteError } = await admin
    .from("invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .single();

  if (inviteError || !invitation) {
    return { error: "Invalid or expired invitation" };
  }

  // Check if expired
  if (new Date(invitation.expires_at) < new Date()) {
    await admin
      .from("invitations")
      .update({ status: "expired" })
      .eq("id", invitation.id);
    return { error: "This invitation has expired" };
  }

  // Check if user exists
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find((u) => u.email === invitation.email);

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
    
    // If they're logged in, verify it's the right account
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser && currentUser.email !== invitation.email) {
      return { error: "Please sign out and use the invited email address" };
    }
  } else {
    // New user - create account
    if (!password) {
      return { error: "Password required", needsPassword: true };
    }

    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email: invitation.email,
      password,
      email_confirm: true,
    });

    if (createError || !newUser.user) {
      console.error("Create user error:", createError);
      return { error: "Failed to create account" };
    }

    userId = newUser.user.id;
  }

  // Check if already a member
  const { data: existingMember } = await admin
    .from("business_users")
    .select("id")
    .eq("business_id", invitation.business_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingMember) {
    return { error: "You are already a member of this team" };
  }

  // Add user to business
  const { error: memberError } = await admin.from("business_users").insert({
    business_id: invitation.business_id,
    user_id: userId,
    role: invitation.role,
    invited_at: invitation.created_at,
    joined_at: new Date().toISOString(),
  });

  if (memberError) {
    console.error("Member creation error:", memberError);
    return { error: "Failed to add user to team" };
  }

  // Update invitation status
  await admin
    .from("invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invitation.id);

  // Sign in the new user
  if (password && !existingUser) {
    await supabase.auth.signInWithPassword({
      email: invitation.email,
      password,
    });
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function revokeInvitation(invitationId: string) {
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: invitation } = await admin
    .from("invitations")
    .select("business_id")
    .eq("id", invitationId)
    .single();

  if (!invitation) {
    return { error: "Invitation not found" };
  }

  // Check permission
  const { data: membership } = await supabase
    .from("business_users")
    .select("role")
    .eq("business_id", invitation.business_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Permission denied" };
  }

  await admin
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId);

  revalidatePath("/settings/team");
  return { success: true };
}

// ============================================
// TEAM MANAGEMENT
// ============================================

export async function updateTeamMemberRole(
  memberId: string,
  role: "admin" | "staff"
) {
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: member } = await admin
    .from("business_users")
    .select("business_id, user_id, role")
    .eq("id", memberId)
    .single();

  if (!member) {
    return { error: "Member not found" };
  }

  if (member.role === "owner") {
    return { error: "Cannot change owner role" };
  }

  const { data: currentMember } = await supabase
    .from("business_users")
    .select("role")
    .eq("business_id", member.business_id)
    .eq("user_id", user.id)
    .single();

  if (!currentMember || currentMember.role !== "owner") {
    return { error: "Only the owner can change roles" };
  }

  await admin
    .from("business_users")
    .update({ role })
    .eq("id", memberId);

  revalidatePath("/settings/team");
  return { success: true };
}

export async function removeTeamMember(memberId: string) {
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: member } = await admin
    .from("business_users")
    .select("business_id, user_id, role")
    .eq("id", memberId)
    .single();

  if (!member) {
    return { error: "Member not found" };
  }

  if (member.role === "owner") {
    return { error: "Cannot remove the owner" };
  }

  if (member.user_id === user.id) {
    return { error: "Cannot remove yourself" };
  }

  const { data: currentMember } = await supabase
    .from("business_users")
    .select("role")
    .eq("business_id", member.business_id)
    .eq("user_id", user.id)
    .single();

  if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
    return { error: "Permission denied" };
  }

  if (currentMember.role === "admin" && member.role === "admin") {
    return { error: "Admins cannot remove other admins" };
  }

  await admin.from("business_users").delete().eq("id", memberId);

  revalidatePath("/settings/team");
  return { success: true };
}

// ============================================
// ONBOARDING
// ============================================

export async function createBusinessForUser(userId: string, data: {
  businessName: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}) {
  const admin = createAdminClient();

  // Generate unique slug
  let slug = data.businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  const { data: existingBusiness } = await admin
    .from("businesses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existingBusiness) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  // Create business
  const { data: business, error: businessError } = await admin
    .from("businesses")
    .insert({
      owner_id: userId,
      name: data.businessName,
      slug,
      email: data.email,
      phone: data.phone || null,
      onboarding_completed: false,
      onboarding_step: 1,
    })
    .select()
    .single();

  if (businessError) {
    console.error("Business creation error:", businessError);
    return { error: businessError.message };
  }

  // Add owner as business_user
  await admin.from("business_users").insert({
    business_id: business.id,
    user_id: userId,
    role: "owner",
    display_name: `${data.firstName} ${data.lastName}`,
    joined_at: new Date().toISOString(),
  });

  // Create user profile
  await admin.from("user_profiles").upsert({
    id: userId,
    first_name: data.firstName,
    last_name: data.lastName,
    phone: data.phone || null,
  });

  return { business };
}

export async function updateOnboardingStep(businessId: string, step: number) {
  const admin = createAdminClient();

  await admin
    .from("businesses")
    .update({ onboarding_step: step })
    .eq("id", businessId);

  return { success: true };
}

export async function updateBusinessOnboarding(businessId: string, data: {
  trade?: string;
  onboarding_step?: number;
  onboarding_completed?: boolean;
}) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("businesses")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", businessId);

  if (error) {
    console.error("Update business error:", error);
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function completeOnboarding(businessId: string) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("businesses")
    .update({ 
      onboarding_completed: true,
      onboarding_step: 5,
      updated_at: new Date().toISOString(),
    })
    .eq("id", businessId);

  if (error) {
    console.error("Complete onboarding error:", error);
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

// ============================================
// HELPERS
// ============================================

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentBusiness() {
  const supabase = await createServerSupabaseClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Try business_users first
  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, role, businesses(*)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.businesses) {
    return {
      ...(membership.businesses as any),
      role: membership.role,
    };
  }

  // Fallback: check if user owns a business directly
  const { data: ownedBusiness } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (ownedBusiness) {
    return {
      ...ownedBusiness,
      role: "owner",
    };
  }

  // Fallback: check profiles table
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    return {
      id: profile.id,
      name: profile.business_name,
      slug: profile.business_slug,
      email: profile.email,
      phone: profile.phone,
      trade: profile.trade,
      onboarding_completed: profile.onboarding_completed,
      role: "owner",
    };
  }

  return null;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireBusiness() {
  const user = await requireAuth();
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");
  return { user, business };
}
