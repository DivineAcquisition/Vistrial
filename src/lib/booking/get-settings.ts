import { createAdminClient } from "@/lib/supabase/admin";
import type {
  BookingPageSettings,
  ServiceAddon,
  CustomBookingField,
  BlackoutDate,
  BookingPageSettingsDefaults,
} from "@/types/booking-settings";

export async function getBookingSettings(
  businessId: string
): Promise<BookingPageSettings | BookingPageSettingsDefaults> {
  const supabase = createAdminClient();

  const { data: settings } = await supabase
    .from("booking_page_settings")
    .select("*")
    .eq("business_id", businessId)
    .single();

  // Return defaults if no settings exist
  if (!settings) {
    return getDefaultSettings();
  }

  return settings as BookingPageSettings;
}

export async function getServiceAddons(
  businessId: string,
  serviceId?: string
): Promise<ServiceAddon[]> {
  const supabase = createAdminClient();

  const query = supabase
    .from("service_addons")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("display_order");

  const { data } = await query;

  // Filter by service if provided
  if (serviceId && data) {
    return data.filter(
      (addon) =>
        !addon.available_for_services ||
        addon.available_for_services.includes(serviceId)
    ) as ServiceAddon[];
  }

  return (data || []) as ServiceAddon[];
}

export async function getCustomFields(
  businessId: string,
  step?: number
): Promise<CustomBookingField[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from("custom_booking_fields")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("display_order");

  if (step) {
    query = query.eq("show_on_step", step);
  }

  const { data } = await query;
  return (data || []) as CustomBookingField[];
}

export async function getBlackoutDates(
  businessId: string
): Promise<BlackoutDate[]> {
  const supabase = createAdminClient();

  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("blackout_dates")
    .select("*")
    .eq("business_id", businessId)
    .gte("date", today);

  return (data || []) as BlackoutDate[];
}

function getDefaultSettings(): BookingPageSettingsDefaults {
  return {
    // Branding
    primary_color: "#7c3aed",
    secondary_color: "#4f46e5",
    accent_color: "#10b981",
    background_color: "#f8fafc",
    card_background_color: "#ffffff",
    text_color: "#1e293b",
    text_muted_color: "#64748b",

    logo_url: null,
    logo_position: "left",
    logo_size: "medium",
    hero_image_url: null,
    favicon_url: null,

    font_family: "Inter",
    heading_font_family: null,
    font_size_base: "16px",

    button_style: "rounded",
    button_size: "large",

    // Layout
    layout_style: "card",
    progress_bar_style: "steps",
    show_sidebar_summary: true,
    sidebar_position: "right",
    max_width: "1200px",

    // Header
    header_style: "colored",
    show_business_name: true,
    show_business_phone: true,
    show_business_email: false,
    header_tagline: null,

    // Footer
    show_footer: true,
    show_powered_by: true,
    footer_text: null,

    // Content
    step1_headline: "Select a Service",
    step1_subheadline: "Choose the type of cleaning you need",
    step2_headline: "Property Details",
    step2_subheadline: "Tell us about your home",
    step3_headline: "Choose Date & Time",
    step3_subheadline: "When would you like us to come?",
    step4_headline: "Contact Information",
    step4_subheadline: "Where should we come and how can we reach you?",
    step5_headline: "Review & Book",
    step5_subheadline: "Please confirm your booking details",

    confirmation_headline: "You're All Set!",
    confirmation_subheadline: "Your cleaning has been scheduled",
    confirmation_message: null,

    service_area_error_message: "Sorry, we don't service this area yet.",
    no_availability_message: "No available times for this date.",

    // Behavior
    show_zip_validation: true,
    show_property_step: true,
    show_frequency_selection: true,
    show_sqft_field: false,
    show_pets_field: true,
    show_property_type_field: false,
    show_special_instructions: true,

    require_email: true,
    require_address: true,

    default_bedrooms: 3,
    default_bathrooms: 2,
    default_frequency: "biweekly",

    // Scheduling
    min_lead_time_hours: 24,
    max_booking_days_ahead: 60,
    time_slot_interval_minutes: 60,
    show_estimated_duration: true,
    allow_same_day_booking: false,
    same_day_cutoff_hour: 12,

    // Pricing
    show_prices_on_services: true,
    show_price_breakdown: true,
    show_price_during_flow: true,
    price_display_format: "from",
    show_discount_badge: true,

    // Payment
    deposit_percentage: 25,
    deposit_type: "percentage",
    deposit_fixed_amount: null,
    show_deposit_explanation: true,
    accept_payment_at_booking: true,
    payment_methods: ["card"],

    // Membership
    enable_recurring: true,
    default_to_recurring: false,
    recurring_discount_weekly: 15,
    recurring_discount_biweekly: 10,
    recurring_discount_monthly: 5,
    show_recurring_savings: true,
    recurring_badge_text_weekly: "Best Value",
    recurring_badge_text_biweekly: "Popular",

    // Add-ons
    enable_addons: true,

    // Custom Fields
    enable_custom_fields: false,

    // Social Proof
    show_reviews: false,
    show_trust_badges: true,
    trust_badges: ["satisfaction", "insured", "background_checked"],
    google_reviews_place_id: null,

    // SEO
    meta_title: null,
    meta_description: null,
    google_analytics_id: null,
    facebook_pixel_id: null,
    custom_head_code: null,

    // Notifications
    send_confirmation_sms: true,
    send_confirmation_email: true,
    send_reminder_sms: true,
    reminder_hours_before: 24,
  };
}

// Export the default settings getter for use in other parts of the application
export { getDefaultSettings };
