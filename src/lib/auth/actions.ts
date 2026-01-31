"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
      },
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "Failed to create user" };
  }

  // 2. Generate unique slug
  const baseSlug = generateSlug(businessName);
  const slug = await ensureUniqueSlug(baseSlug);

  // 3. Create business record (using admin to bypass RLS)
  const { data: business, error: businessError } = await admin
    .from("businesses")
    .insert({
      owner_id: authData.user.id,
      name: businessName,
      slug,
      email,
      phone,
      is_active: true,
      settings: {
        timezone: "America/New_York",
        currency: "USD",
      },
    })
    .select()
    .single();

  if (businessError) {
    console.error("Business creation error:", businessError);
    // Try creating a profile instead if businesses table doesn't exist
    const { error: profileError } = await admin
      .from("profiles")
      .upsert({
        id: authData.user.id,
        business_name: businessName,
        business_slug: slug,
        email,
        phone,
        onboarding_completed: true,
      });
    
    if (profileError) {
      console.error("Profile creation error:", profileError);
      // If both business and profile creation failed, send to onboarding
      revalidatePath("/", "layout");
      redirect("/onboarding");
    }
    
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }

  // 4. Create default cost settings (if table exists)
  try {
    await admin.from("cost_settings").insert({
      business_id: business.id,
      hourly_labor_rate: 18,
      cleaner_count_default: 1,
      supply_cost_per_job: 5,
      travel_cost_per_mile: 0.67,
      average_travel_miles: 10,
      target_profit_margin: 30,
      minimum_profit_margin: 15,
      minimum_job_price: 75,
      sqft_per_hour: 500,
    });
  } catch (e) {
    console.log("cost_settings table may not exist:", e);
  }

  // 5. Create default service types (if table exists)
  try {
    const defaultServices = [
      {
        business_id: business.id,
        name: "Standard Cleaning",
        description: "Regular maintenance cleaning for homes",
        pricing_type: "variable",
        price_1bed: 100,
        price_2bed: 120,
        price_3bed: 140,
        price_4bed: 180,
        price_5bed_plus: 220,
        price_per_bathroom: 15,
        estimated_duration_minutes: 120,
        is_active: true,
        display_order: 1,
      },
      {
        business_id: business.id,
        name: "Deep Cleaning",
        description: "Thorough top-to-bottom cleaning",
        pricing_type: "variable",
        price_1bed: 150,
        price_2bed: 180,
        price_3bed: 220,
        price_4bed: 280,
        price_5bed_plus: 350,
        price_per_bathroom: 25,
        estimated_duration_minutes: 240,
        is_active: true,
        display_order: 2,
      },
      {
        business_id: business.id,
        name: "Move In/Out Cleaning",
        description: "Complete cleaning for empty homes",
        pricing_type: "variable",
        price_1bed: 180,
        price_2bed: 220,
        price_3bed: 280,
        price_4bed: 350,
        price_5bed_plus: 450,
        price_per_bathroom: 30,
        estimated_duration_minutes: 300,
        is_active: true,
        display_order: 3,
      },
    ];

    await admin.from("service_types").insert(defaultServices);
  } catch (e) {
    console.log("service_types table may not exist:", e);
  }

  // 6. Create default availability (Mon-Fri 8am-5pm) (if table exists)
  try {
    const defaultAvailability = [1, 2, 3, 4, 5].map((day) => ({
      business_id: business.id,
      day_of_week: day,
      start_time: "08:00",
      end_time: "17:00",
      is_available: true,
    }));

    await admin.from("availability").insert(defaultAvailability);
  } catch (e) {
    console.log("availability table may not exist:", e);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
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
