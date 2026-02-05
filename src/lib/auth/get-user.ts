// @ts-nocheck
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function requireAuth() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function getCurrentBusiness() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Try businesses table first
  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  if (business) {
    return business;
  }

  // Fall back to profiles table
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile) {
    return {
      id: profile.id,
      name: profile.business_name,
      slug: profile.business_slug,
      email: profile.email,
      phone: profile.phone,
      logo_url: profile.logo_url,
    };
  }

  return null;
}

export async function requireBusiness() {
  const user = await requireAuth();
  const business = await getCurrentBusiness();

  if (!business) {
    redirect("/onboarding");
  }

  return { user, business };
}
