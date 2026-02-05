// @ts-nocheck
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
// HELPER FUNCTIONS
// ============================================

function generateSlug(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  const admin = createAdminClient();
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const { data } = await admin
      .from("businesses")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) break;
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
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

  // 2. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.fullName,
        phone: data.phone,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "Failed to create account" };
  }

  // 3. Generate unique slug and create business
  const baseSlug = generateSlug(data.businessName);
  const slug = await ensureUniqueSlug(baseSlug);

  const { error: businessError } = await admin.from("businesses").insert({
    owner_id: authData.user.id,
    name: data.businessName,
    slug,
    email: data.email,
    phone: data.phone,
    is_active: true,
  });

  if (businessError) {
    console.error("Business creation error:", businessError);
    // Continue anyway - user can set up business later
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
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

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${redirectTo || "/dashboard"}`,
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

export async function requireBusiness(): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; business: { id: string; [key: string]: unknown } }> {
  const user = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  // If no business, create a default one
  if (!business) {
    const admin = createAdminClient();
    const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
    const defaultName = `${fullName}'s Business`;
    const slug = await ensureUniqueSlug(generateSlug(defaultName));

    const { data: newBusiness, error } = await admin
      .from("businesses")
      .insert({
        owner_id: user.id,
        name: defaultName,
        slug,
        email: user.email,
        phone: user.user_metadata?.phone,
        is_active: true,
      })
      .select()
      .single();

    if (error || !newBusiness) {
      redirect("/onboarding");
    }

    return { user, business: newBusiness as { id: string; [key: string]: unknown } };
  }

  return { user, business: business as { id: string; [key: string]: unknown } };
}
