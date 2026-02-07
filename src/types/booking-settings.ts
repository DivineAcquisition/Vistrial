// ============================================
// VISTRIAL - BOOKING CUSTOMIZATION TYPES
// TypeScript types for booking page customization
// ============================================

export interface BookingPageSettings {
  id: string;
  business_id: string;

  // Branding
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  card_background_color: string;
  text_color: string;
  text_muted_color: string;

  logo_url: string | null;
  logo_position: "left" | "center" | "right";
  logo_size: "small" | "medium" | "large";
  hero_image_url: string | null;
  favicon_url: string | null;

  font_family: string;
  heading_font_family: string | null;
  font_size_base: string;

  button_style: "rounded" | "pill" | "square";
  button_size: "small" | "medium" | "large";

  // Layout
  layout_style: "card" | "minimal" | "full-width";
  progress_bar_style: "steps" | "bar" | "dots" | "none";
  show_sidebar_summary: boolean;
  sidebar_position: "left" | "right";
  max_width: string;

  // Header
  header_style: "colored" | "white" | "transparent";
  show_business_name: boolean;
  show_business_phone: boolean;
  show_business_email: boolean;
  header_tagline: string | null;

  // Footer
  show_footer: boolean;
  show_powered_by: boolean;
  footer_text: string | null;

  // Content
  step1_headline: string;
  step1_subheadline: string;
  step2_headline: string;
  step2_subheadline: string;
  step3_headline: string;
  step3_subheadline: string;
  step4_headline: string;
  step4_subheadline: string;
  step5_headline: string;
  step5_subheadline: string;

  confirmation_headline: string;
  confirmation_subheadline: string;
  confirmation_message: string | null;

  service_area_error_message: string;
  no_availability_message: string;

  // Behavior
  show_zip_validation: boolean;
  show_property_step: boolean;
  show_frequency_selection: boolean;
  show_sqft_field: boolean;
  show_pets_field: boolean;
  show_property_type_field: boolean;
  show_special_instructions: boolean;

  require_email: boolean;
  require_address: boolean;

  default_bedrooms: number;
  default_bathrooms: number;
  default_frequency: "onetime" | "weekly" | "biweekly" | "monthly";

  // Scheduling
  min_lead_time_hours: number;
  max_booking_days_ahead: number;
  time_slot_interval_minutes: number;
  show_estimated_duration: boolean;
  allow_same_day_booking: boolean;
  same_day_cutoff_hour: number;

  // Pricing
  show_prices_on_services: boolean;
  show_price_breakdown: boolean;
  show_price_during_flow: boolean;
  price_display_format: "from" | "fixed" | "range" | "none";
  show_discount_badge: boolean;

  // Payment
  deposit_percentage: number;
  deposit_type: "percentage" | "fixed" | "none" | "full";
  deposit_fixed_amount: number | null;
  show_deposit_explanation: boolean;
  accept_payment_at_booking: boolean;
  payment_methods: string[];

  // Membership
  enable_recurring: boolean;
  default_to_recurring: boolean;
  recurring_discount_weekly: number;
  recurring_discount_biweekly: number;
  recurring_discount_monthly: number;
  show_recurring_savings: boolean;
  recurring_badge_text_weekly: string;
  recurring_badge_text_biweekly: string;

  // Add-ons
  enable_addons: boolean;

  // Custom Fields
  enable_custom_fields: boolean;

  // Social Proof
  show_reviews: boolean;
  show_trust_badges: boolean;
  trust_badges: string[];
  google_reviews_place_id: string | null;

  // SEO
  meta_title: string | null;
  meta_description: string | null;
  google_analytics_id: string | null;
  facebook_pixel_id: string | null;
  custom_head_code: string | null;

  // Notifications
  send_confirmation_sms: boolean;
  send_confirmation_email: boolean;
  send_reminder_sms: boolean;
  reminder_hours_before: number;
}

export interface ServiceAddon {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price_type: "fixed" | "per_room" | "per_hour" | "percentage";
  price: number;
  icon: string | null;
  display_order: number;
  is_active: boolean;
  available_for_services: string[] | null;
  is_popular: boolean;
  max_quantity: number;
}

export interface CustomBookingField {
  id: string;
  business_id: string;
  field_key: string;
  label: string;
  placeholder: string | null;
  help_text: string | null;
  field_type:
    | "text"
    | "textarea"
    | "select"
    | "checkbox"
    | "radio"
    | "number"
    | "date"
    | "file"
    | "phone"
    | "email";
  options: { value: string; label: string }[] | null;
  is_required: boolean;
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  pattern: string | null;
  display_order: number;
  show_on_step: number;
  width: "full" | "half";
  show_condition: { field: string; operator: string; value: unknown } | null;
  is_active: boolean;
}

export interface BlackoutDate {
  id: string;
  business_id: string;
  date: string;
  reason: string | null;
  is_recurring: boolean;
}

// Input types for API operations
export type BookingPageSettingsInput = Partial<
  Omit<BookingPageSettings, "id" | "business_id">
>;

export type ServiceAddonInput = Omit<
  ServiceAddon,
  "id" | "business_id" | "display_order"
>;

export type CustomBookingFieldInput = Omit<
  CustomBookingField,
  "id" | "business_id" | "display_order"
>;
