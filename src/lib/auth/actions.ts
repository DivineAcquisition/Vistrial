"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendVerificationCode, verifyCode } from "@/lib/verification/send-code";

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

  // 3. Create auth user (business created during onboarding)
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.fullName,
        first_name: firstName,
        last_name: lastName,
        phone: data.phone,
        business_name: data.businessName, // Store for use in onboarding
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding`,
    },
  });

  if (authError) {
    console.error("Signup auth error:", authError);
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "Failed to create account" };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

// ============================================
// SIGN IN
// ============================================

export async function signIn(formData: FormData) {
  const supabase = await createServerSupabaseClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = (formData.get("redirect") as string) || "/dashboard";

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

// ============================================
// SIGN IN WITH GOOGLE
// ============================================

export async function signInWithGoogle(redirectTo?: string) {
  const supabase = await createServerSupabaseClient();

  // Auth callback will check for business and redirect appropriately
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback${redirectTo ? `?redirect=${redirectTo}` : ""}`,
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

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  return business;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireBusiness() {
  const user = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  // If no business exists, redirect to onboarding
  if (!business) {
    redirect("/onboarding");
  }

  // If onboarding not completed, redirect to onboarding
  if (!business.onboarding_completed) {
    redirect("/onboarding");
  }

  return { user, business };
}
