"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendVerificationCode, verifyCode } from "@/lib/verification/send-code";

// Domain configuration
const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "vistrial.io";
const APP_URL = `https://app.${BASE_DOMAIN}`;
const ACCESS_URL = `https://access.${BASE_DOMAIN}`;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ============================================
// TYPES
// ============================================

interface SignUpStep1Data {
  email: string;
  phone: string;
  fullName: string;
  businessName: string;
  verifyVia: "email" | "sms";
}

interface SignUpStep2Data {
  email: string;
  phone: string;
  fullName: string;
  businessName: string;
  password: string;
  code: string;
  verifyVia: "email" | "sms";
}

// ============================================
// SIGNUP STEP 1: Send Verification Code
// ============================================

export async function signUpStep1(data: SignUpStep1Data) {
  const destination = data.verifyVia === "email" ? data.email : data.phone;
  
  const result = await sendVerificationCode(data.verifyVia, destination, "signup");
  
  if (!result.success) {
    return { error: result.error || "Failed to send verification code" };
  }

  return { success: true };
}

// ============================================
// SIGNUP STEP 2: Verify & Create Account
// ============================================

export async function signUpStep2(data: SignUpStep2Data) {
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  // 1. Verify the code
  const destination = data.verifyVia === "email" ? data.email : data.phone;
  const verification = await verifyCode(data.verifyVia, destination, data.code);
  
  if (!verification.success) {
    return { error: verification.error || "Invalid verification code" };
  }

  // 2. Parse full name into first/last for database trigger compatibility
  const nameParts = data.fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  // 3. Check if user already exists
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const userExists = existingUsers?.users?.some(u => u.email === data.email);
  
  if (userExists) {
    return { error: "An account with this email already exists. Please sign in instead." };
  }

  // 4. Create auth user using admin client (bypasses RLS/triggers issues)
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true, // Auto-confirm since we verified via code
    user_metadata: {
      full_name: data.fullName,
      first_name: firstName,
      last_name: lastName,
      phone: data.phone,
      business_name: data.businessName,
    },
  });

  if (authError) {
    console.error("Signup auth error:", authError);
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "Failed to create account" };
  }

  // 5. Create user profile manually (in case trigger doesn't fire with admin create)
  await admin.from("user_profiles").upsert({
    id: authData.user.id,
    first_name: firstName,
    last_name: lastName,
    phone: data.phone,
  }, { onConflict: "id" });

  // 6. Sign the user in
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  if (signInError) {
    console.error("Auto sign-in error:", signInError);
    // User was created, just redirect to login
    const loginUrl = IS_PRODUCTION ? `${ACCESS_URL}/login?message=Account created. Please sign in.` : "/login?message=Account created. Please sign in.";
    redirect(loginUrl);
  }

  // Auto-create business for the new user
  await ensureBusinessExists(authData.user);

  revalidatePath("/", "layout");
  
  // Redirect straight to dashboard
  const dashboardUrl = IS_PRODUCTION ? `${APP_URL}/dashboard` : "/dashboard";
  redirect(dashboardUrl);
}

// Auto-create business for new users
async function ensureBusinessExists(user: any) {
  try {
    const admin = createAdminClient();
    
    // Check if business exists
    const { data: businesses } = await admin
      .from("businesses")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    if (businesses && businesses.length > 0) {
      return; // Already exists
    }

    // Create business
    const userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User";
    const businessName = user.user_metadata?.business_name || `${userName}'s Business`;
    const slug = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;

    await admin
      .from("businesses")
      .insert({
        owner_id: user.id,
        name: businessName,
        slug: slug,
        trade: "cleaning",
        email: user.email,
        phone: user.user_metadata?.phone || null,
        primary_color: "#6E47D1",
        settings: {
          timezone: "America/New_York",
          currency: "USD",
          owner_name: userName,
        },
        onboarding_completed: true,
        is_active: true,
      });

    console.log("Created business for user:", user.id);
  } catch (err) {
    console.error("Error creating business:", err);
  }
}

// ============================================
// SIGN IN
// ============================================

export async function signIn(formData: FormData) {
  const supabase = await createServerSupabaseClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = formData.get("redirect") as string;

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  if (authData.user) {
    // Auto-create business if none exists
    await ensureBusinessExists(authData.user);

    revalidatePath("/", "layout");

    // Determine redirect destination
    let destination: string;
    if (redirectTo && redirectTo.startsWith("http")) {
      destination = redirectTo;
    } else {
      const path = redirectTo || "/dashboard";
      destination = IS_PRODUCTION ? `${APP_URL}${path}` : path;
    }

    redirect(destination);
  }

  revalidatePath("/", "layout");
  const defaultDestination = IS_PRODUCTION ? `${APP_URL}/dashboard` : "/dashboard";
  redirect(defaultDestination);
}

// ============================================
// SIGN IN WITH GOOGLE
// ============================================

export async function signInWithGoogle(redirectTo?: string) {
  const supabase = await createServerSupabaseClient();

  // Determine callback URL - use app domain in production
  const callbackBase = IS_PRODUCTION 
    ? APP_URL 
    : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
  
  const callbackUrl = `${callbackBase}/auth/callback${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`;

  // Auth callback will check for business and redirect appropriately
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl,
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.url) {
    redirect(data.url);
  }

  return { error: "Failed to initiate Google sign in" };
}

// ============================================
// SIGN OUT
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

export async function resetPassword(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const email = formData.get("email") as string;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function updatePassword(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

// ============================================
// RESEND VERIFICATION CODE
// ============================================

export async function resendVerificationCode(
  channel: "email" | "sms",
  destination: string
) {
  const result = await sendVerificationCode(channel, destination, "signup");
  
  if (!result.success) {
    return { error: result.error || "Failed to resend code" };
  }

  return { success: true };
}

// ============================================
// GET CURRENT USER & BUSINESS
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

  // Handle potential duplicates by getting most recent
  const { data: businesses } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  return businesses?.[0] || null;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireBusiness() {
  const user = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Handle potential duplicates by getting most recent
  const { data: businesses } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  let business = businesses?.[0] || null;

  // Auto-create business if none exists
  if (!business) {
    await ensureBusinessExists(user);
    
    // Fetch the newly created business
    const { data: newBusinesses } = await supabase
      .from("businesses")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    
    business = newBusinesses?.[0] || null;
  }

  if (!business) {
    throw new Error("Failed to create business");
  }

  return { user, business };
}
