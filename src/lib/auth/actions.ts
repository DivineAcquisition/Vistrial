"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateVerificationCode, sendVerificationEmail } from "@/lib/email/resend";

// Declare global type for verification codes storage
declare global {
  var verificationCodes: Map<string, { code: string; expiresAt: Date; verified: boolean }> | undefined;
}

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
      .single();

    if (!data) break;
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

export async function signUp(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;
  const businessName = formData.get("businessName") as string;
  const phone = formData.get("phone") as string;

  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        business_name: businessName,
      },
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "Failed to create user" };
  }

  // 2. Generate and send verification code
  const verificationCode = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Store the verification code
  try {
    await admin.from("verification_codes").upsert(
      {
        email,
        code: verificationCode,
        expires_at: expiresAt.toISOString(),
        verified: false,
        created_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    );
  } catch (dbError) {
    console.log("verification_codes table may not exist, using memory storage");
    // Store in global memory as fallback
    if (!global.verificationCodes) {
      global.verificationCodes = new Map();
    }
    global.verificationCodes.set(email, {
      code: verificationCode,
      expiresAt,
      verified: false,
    });
  }

  // Send the verification email
  const emailResult = await sendVerificationEmail(email, verificationCode, businessName);
  if (!emailResult.success) {
    console.log(`[DEV] Verification code for ${email}: ${verificationCode}`);
  }

  // 3. Generate unique slug
  const baseSlug = generateSlug(businessName);
  const slug = await ensureUniqueSlug(baseSlug);

  // 4. Create a profile record with pending verification status
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: authData.user.id,
      business_name: businessName,
      business_slug: slug,
      email,
      phone,
      onboarding_completed: false, // Not complete until email verified
      email_verified: false,
      full_name: fullName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

  if (profileError) {
    console.error("Profile creation error:", profileError);
  }

  // 5. Redirect to onboarding for email verification
  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function signIn(formData: FormData) {
  const supabase = await createServerSupabaseClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = formData.get("redirect") as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect(redirectTo || "/dashboard");
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

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

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}
