// ============================================
// DATABASE MAPPING UTILITIES
// Convert between snake_case DB format and camelCase TS format
// ============================================

import type {
  BookingPageSettings,
  ServiceAddon,
  CustomBookingField,
  BookingAddon,
  BookingCustomFieldValue,
  BlackoutDate,
  TimeSlotOverride,
  SelectOption,
  ShowCondition,
  TimeSlot,
  PaymentMethod,
  TrustBadgeType,
} from './booking-schema'

// ============================================
// DATABASE ROW TYPES (snake_case)
// ============================================

export interface BookingPageSettingsRow {
  id: string
  business_id: string

  // Branding - Colors
  primary_color: string
  secondary_color: string
  accent_color: string
  background_color: string
  card_background_color: string
  text_color: string
  text_muted_color: string

  // Logo & Images
  logo_url: string | null
  logo_position: string
  logo_size: string
  hero_image_url: string | null
  favicon_url: string | null

  // Typography
  font_family: string
  heading_font_family: string | null
  font_size_base: string

  // Button Styles
  button_style: string
  button_size: string

  // Layout
  layout_style: string
  progress_bar_style: string
  show_sidebar_summary: boolean
  sidebar_position: string
  max_width: string

  // Header
  header_style: string
  show_business_name: boolean
  show_business_phone: boolean
  show_business_email: boolean
  header_tagline: string | null

  // Footer
  show_footer: boolean
  show_powered_by: boolean
  footer_text: string | null

  // Step headlines
  step1_headline: string
  step1_subheadline: string
  step2_headline: string
  step2_subheadline: string
  step3_headline: string
  step3_subheadline: string
  step4_headline: string
  step4_subheadline: string
  step5_headline: string
  step5_subheadline: string

  // Confirmation
  confirmation_headline: string
  confirmation_subheadline: string
  confirmation_message: string | null

  // Custom messages
  service_area_error_message: string
  no_availability_message: string

  // Behavior
  show_zip_validation: boolean
  show_property_step: boolean
  show_frequency_selection: boolean
  show_sqft_field: boolean
  show_pets_field: boolean
  show_property_type_field: boolean
  show_special_instructions: boolean

  // Required fields
  require_email: boolean
  require_address: boolean

  // Default values
  default_bedrooms: number
  default_bathrooms: number
  default_frequency: string

  // Scheduling
  min_lead_time_hours: number
  max_booking_days_ahead: number
  time_slot_interval_minutes: number
  show_estimated_duration: boolean
  allow_same_day_booking: boolean
  same_day_cutoff_hour: number

  // Pricing Display
  show_prices_on_services: boolean
  show_price_breakdown: boolean
  show_price_during_flow: boolean
  price_display_format: string
  show_discount_badge: boolean

  // Payment
  deposit_percentage: number
  deposit_type: string
  deposit_fixed_amount: number | null
  show_deposit_explanation: boolean
  accept_payment_at_booking: boolean
  payment_methods: string // JSON string

  // Membership/Frequency
  enable_recurring: boolean
  default_to_recurring: boolean
  recurring_discount_weekly: number
  recurring_discount_biweekly: number
  recurring_discount_monthly: number
  show_recurring_savings: boolean
  recurring_badge_text_weekly: string
  recurring_badge_text_biweekly: string

  // Add-ons & Custom Fields
  enable_addons: boolean
  enable_custom_fields: boolean

  // Social Proof
  show_reviews: boolean
  show_trust_badges: boolean
  trust_badges: string // JSON string
  google_reviews_place_id: string | null

  // SEO & Analytics
  meta_title: string | null
  meta_description: string | null
  google_analytics_id: string | null
  facebook_pixel_id: string | null
  custom_head_code: string | null

  // Notifications
  send_confirmation_sms: boolean
  send_confirmation_email: boolean
  send_reminder_sms: boolean
  reminder_hours_before: number

  // Timestamps
  created_at: string
  updated_at: string
}

export interface ServiceAddonRow {
  id: string
  business_id: string
  name: string
  description: string | null
  price_type: string
  price: number
  icon: string | null
  display_order: number
  is_active: boolean
  available_for_services: string[] | null
  is_popular: boolean
  max_quantity: number
  created_at: string
  updated_at: string
}

export interface CustomBookingFieldRow {
  id: string
  business_id: string
  field_key: string
  label: string
  placeholder: string | null
  help_text: string | null
  field_type: string
  options: string | null // JSON string
  is_required: boolean
  min_length: number | null
  max_length: number | null
  min_value: number | null
  max_value: number | null
  pattern: string | null
  display_order: number
  show_on_step: number
  width: string
  show_condition: string | null // JSON string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BookingAddonRow {
  id: string
  booking_id: string
  addon_id: string
  quantity: number
  unit_price: number
  total_price: number
  created_at: string
}

export interface BookingCustomFieldValueRow {
  id: string
  booking_id: string
  field_id: string
  field_key: string
  value: string | null
  created_at: string
}

export interface BlackoutDateRow {
  id: string
  business_id: string
  date: string
  reason: string | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
  created_at: string
}

export interface TimeSlotOverrideRow {
  id: string
  business_id: string
  date: string
  slots: string // JSON string
  created_at: string
}

// ============================================
// MAPPER FUNCTIONS: DB Row -> TypeScript Object
// ============================================

export function mapBookingPageSettingsFromRow(row: BookingPageSettingsRow): BookingPageSettings {
  return {
    id: row.id,
    businessId: row.business_id,

    // Branding - Colors
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    accentColor: row.accent_color,
    backgroundColor: row.background_color,
    cardBackgroundColor: row.card_background_color,
    textColor: row.text_color,
    textMutedColor: row.text_muted_color,

    // Logo & Images
    logoUrl: row.logo_url,
    logoPosition: row.logo_position as BookingPageSettings['logoPosition'],
    logoSize: row.logo_size as BookingPageSettings['logoSize'],
    heroImageUrl: row.hero_image_url,
    faviconUrl: row.favicon_url,

    // Typography
    fontFamily: row.font_family,
    headingFontFamily: row.heading_font_family,
    fontSizeBase: row.font_size_base,

    // Button Styles
    buttonStyle: row.button_style as BookingPageSettings['buttonStyle'],
    buttonSize: row.button_size as BookingPageSettings['buttonSize'],

    // Layout
    layoutStyle: row.layout_style as BookingPageSettings['layoutStyle'],
    progressBarStyle: row.progress_bar_style as BookingPageSettings['progressBarStyle'],
    showSidebarSummary: row.show_sidebar_summary,
    sidebarPosition: row.sidebar_position as BookingPageSettings['sidebarPosition'],
    maxWidth: row.max_width,

    // Header
    headerStyle: row.header_style as BookingPageSettings['headerStyle'],
    showBusinessName: row.show_business_name,
    showBusinessPhone: row.show_business_phone,
    showBusinessEmail: row.show_business_email,
    headerTagline: row.header_tagline,

    // Footer
    showFooter: row.show_footer,
    showPoweredBy: row.show_powered_by,
    footerText: row.footer_text,

    // Step headlines
    step1Headline: row.step1_headline,
    step1Subheadline: row.step1_subheadline,
    step2Headline: row.step2_headline,
    step2Subheadline: row.step2_subheadline,
    step3Headline: row.step3_headline,
    step3Subheadline: row.step3_subheadline,
    step4Headline: row.step4_headline,
    step4Subheadline: row.step4_subheadline,
    step5Headline: row.step5_headline,
    step5Subheadline: row.step5_subheadline,

    // Confirmation
    confirmationHeadline: row.confirmation_headline,
    confirmationSubheadline: row.confirmation_subheadline,
    confirmationMessage: row.confirmation_message,

    // Custom messages
    serviceAreaErrorMessage: row.service_area_error_message,
    noAvailabilityMessage: row.no_availability_message,

    // Behavior
    showZipValidation: row.show_zip_validation,
    showPropertyStep: row.show_property_step,
    showFrequencySelection: row.show_frequency_selection,
    showSqftField: row.show_sqft_field,
    showPetsField: row.show_pets_field,
    showPropertyTypeField: row.show_property_type_field,
    showSpecialInstructions: row.show_special_instructions,

    // Required fields
    requireEmail: row.require_email,
    requireAddress: row.require_address,

    // Default values
    defaultBedrooms: row.default_bedrooms,
    defaultBathrooms: row.default_bathrooms,
    defaultFrequency: row.default_frequency as BookingPageSettings['defaultFrequency'],

    // Scheduling
    minLeadTimeHours: row.min_lead_time_hours,
    maxBookingDaysAhead: row.max_booking_days_ahead,
    timeSlotIntervalMinutes: row.time_slot_interval_minutes,
    showEstimatedDuration: row.show_estimated_duration,
    allowSameDayBooking: row.allow_same_day_booking,
    sameDayCutoffHour: row.same_day_cutoff_hour,

    // Pricing Display
    showPricesOnServices: row.show_prices_on_services,
    showPriceBreakdown: row.show_price_breakdown,
    showPriceDuringFlow: row.show_price_during_flow,
    priceDisplayFormat: row.price_display_format as BookingPageSettings['priceDisplayFormat'],
    showDiscountBadge: row.show_discount_badge,

    // Payment
    depositPercentage: row.deposit_percentage,
    depositType: row.deposit_type as BookingPageSettings['depositType'],
    depositFixedAmount: row.deposit_fixed_amount,
    showDepositExplanation: row.show_deposit_explanation,
    acceptPaymentAtBooking: row.accept_payment_at_booking,
    paymentMethods: JSON.parse(row.payment_methods) as PaymentMethod[],

    // Membership/Frequency
    enableRecurring: row.enable_recurring,
    defaultToRecurring: row.default_to_recurring,
    recurringDiscountWeekly: row.recurring_discount_weekly,
    recurringDiscountBiweekly: row.recurring_discount_biweekly,
    recurringDiscountMonthly: row.recurring_discount_monthly,
    showRecurringSavings: row.show_recurring_savings,
    recurringBadgeTextWeekly: row.recurring_badge_text_weekly,
    recurringBadgeTextBiweekly: row.recurring_badge_text_biweekly,

    // Add-ons & Custom Fields
    enableAddons: row.enable_addons,
    enableCustomFields: row.enable_custom_fields,

    // Social Proof
    showReviews: row.show_reviews,
    showTrustBadges: row.show_trust_badges,
    trustBadges: JSON.parse(row.trust_badges) as TrustBadgeType[],
    googleReviewsPlaceId: row.google_reviews_place_id,

    // SEO & Analytics
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    googleAnalyticsId: row.google_analytics_id,
    facebookPixelId: row.facebook_pixel_id,
    customHeadCode: row.custom_head_code,

    // Notifications
    sendConfirmationSms: row.send_confirmation_sms,
    sendConfirmationEmail: row.send_confirmation_email,
    sendReminderSms: row.send_reminder_sms,
    reminderHoursBefore: row.reminder_hours_before,

    // Timestamps
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function mapServiceAddonFromRow(row: ServiceAddonRow): ServiceAddon {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    description: row.description,
    priceType: row.price_type as ServiceAddon['priceType'],
    price: row.price,
    icon: row.icon,
    displayOrder: row.display_order,
    isActive: row.is_active,
    availableForServices: row.available_for_services,
    isPopular: row.is_popular,
    maxQuantity: row.max_quantity,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function mapCustomBookingFieldFromRow(row: CustomBookingFieldRow): CustomBookingField {
  return {
    id: row.id,
    businessId: row.business_id,
    fieldKey: row.field_key,
    label: row.label,
    placeholder: row.placeholder,
    helpText: row.help_text,
    fieldType: row.field_type as CustomBookingField['fieldType'],
    options: row.options ? (JSON.parse(row.options) as SelectOption[]) : null,
    isRequired: row.is_required,
    minLength: row.min_length,
    maxLength: row.max_length,
    minValue: row.min_value,
    maxValue: row.max_value,
    pattern: row.pattern,
    displayOrder: row.display_order,
    showOnStep: row.show_on_step,
    width: row.width as CustomBookingField['width'],
    showCondition: row.show_condition ? (JSON.parse(row.show_condition) as ShowCondition) : null,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function mapBookingAddonFromRow(row: BookingAddonRow): BookingAddon {
  return {
    id: row.id,
    bookingId: row.booking_id,
    addonId: row.addon_id,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    totalPrice: row.total_price,
    createdAt: new Date(row.created_at),
  }
}

export function mapBookingCustomFieldValueFromRow(row: BookingCustomFieldValueRow): BookingCustomFieldValue {
  return {
    id: row.id,
    bookingId: row.booking_id,
    fieldId: row.field_id,
    fieldKey: row.field_key,
    value: row.value,
    createdAt: new Date(row.created_at),
  }
}

export function mapBlackoutDateFromRow(row: BlackoutDateRow): BlackoutDate {
  return {
    id: row.id,
    businessId: row.business_id,
    date: row.date,
    reason: row.reason,
    allDay: row.all_day,
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: new Date(row.created_at),
  }
}

export function mapTimeSlotOverrideFromRow(row: TimeSlotOverrideRow): TimeSlotOverride {
  return {
    id: row.id,
    businessId: row.business_id,
    date: row.date,
    slots: JSON.parse(row.slots) as TimeSlot[],
    createdAt: new Date(row.created_at),
  }
}

// ============================================
// MAPPER FUNCTIONS: TypeScript Object -> DB Row
// ============================================

export function mapBookingPageSettingsToRow(
  settings: Partial<BookingPageSettings> & { businessId: string }
): Partial<BookingPageSettingsRow> {
  const row: Partial<BookingPageSettingsRow> = {
    business_id: settings.businessId,
  }

  if (settings.id !== undefined) row.id = settings.id

  // Branding - Colors
  if (settings.primaryColor !== undefined) row.primary_color = settings.primaryColor
  if (settings.secondaryColor !== undefined) row.secondary_color = settings.secondaryColor
  if (settings.accentColor !== undefined) row.accent_color = settings.accentColor
  if (settings.backgroundColor !== undefined) row.background_color = settings.backgroundColor
  if (settings.cardBackgroundColor !== undefined) row.card_background_color = settings.cardBackgroundColor
  if (settings.textColor !== undefined) row.text_color = settings.textColor
  if (settings.textMutedColor !== undefined) row.text_muted_color = settings.textMutedColor

  // Logo & Images
  if (settings.logoUrl !== undefined) row.logo_url = settings.logoUrl
  if (settings.logoPosition !== undefined) row.logo_position = settings.logoPosition
  if (settings.logoSize !== undefined) row.logo_size = settings.logoSize
  if (settings.heroImageUrl !== undefined) row.hero_image_url = settings.heroImageUrl
  if (settings.faviconUrl !== undefined) row.favicon_url = settings.faviconUrl

  // Typography
  if (settings.fontFamily !== undefined) row.font_family = settings.fontFamily
  if (settings.headingFontFamily !== undefined) row.heading_font_family = settings.headingFontFamily
  if (settings.fontSizeBase !== undefined) row.font_size_base = settings.fontSizeBase

  // Button Styles
  if (settings.buttonStyle !== undefined) row.button_style = settings.buttonStyle
  if (settings.buttonSize !== undefined) row.button_size = settings.buttonSize

  // Layout
  if (settings.layoutStyle !== undefined) row.layout_style = settings.layoutStyle
  if (settings.progressBarStyle !== undefined) row.progress_bar_style = settings.progressBarStyle
  if (settings.showSidebarSummary !== undefined) row.show_sidebar_summary = settings.showSidebarSummary
  if (settings.sidebarPosition !== undefined) row.sidebar_position = settings.sidebarPosition
  if (settings.maxWidth !== undefined) row.max_width = settings.maxWidth

  // Header
  if (settings.headerStyle !== undefined) row.header_style = settings.headerStyle
  if (settings.showBusinessName !== undefined) row.show_business_name = settings.showBusinessName
  if (settings.showBusinessPhone !== undefined) row.show_business_phone = settings.showBusinessPhone
  if (settings.showBusinessEmail !== undefined) row.show_business_email = settings.showBusinessEmail
  if (settings.headerTagline !== undefined) row.header_tagline = settings.headerTagline

  // Footer
  if (settings.showFooter !== undefined) row.show_footer = settings.showFooter
  if (settings.showPoweredBy !== undefined) row.show_powered_by = settings.showPoweredBy
  if (settings.footerText !== undefined) row.footer_text = settings.footerText

  // Step headlines
  if (settings.step1Headline !== undefined) row.step1_headline = settings.step1Headline
  if (settings.step1Subheadline !== undefined) row.step1_subheadline = settings.step1Subheadline
  if (settings.step2Headline !== undefined) row.step2_headline = settings.step2Headline
  if (settings.step2Subheadline !== undefined) row.step2_subheadline = settings.step2Subheadline
  if (settings.step3Headline !== undefined) row.step3_headline = settings.step3Headline
  if (settings.step3Subheadline !== undefined) row.step3_subheadline = settings.step3Subheadline
  if (settings.step4Headline !== undefined) row.step4_headline = settings.step4Headline
  if (settings.step4Subheadline !== undefined) row.step4_subheadline = settings.step4Subheadline
  if (settings.step5Headline !== undefined) row.step5_headline = settings.step5Headline
  if (settings.step5Subheadline !== undefined) row.step5_subheadline = settings.step5Subheadline

  // Confirmation
  if (settings.confirmationHeadline !== undefined) row.confirmation_headline = settings.confirmationHeadline
  if (settings.confirmationSubheadline !== undefined) row.confirmation_subheadline = settings.confirmationSubheadline
  if (settings.confirmationMessage !== undefined) row.confirmation_message = settings.confirmationMessage

  // Custom messages
  if (settings.serviceAreaErrorMessage !== undefined) row.service_area_error_message = settings.serviceAreaErrorMessage
  if (settings.noAvailabilityMessage !== undefined) row.no_availability_message = settings.noAvailabilityMessage

  // Behavior
  if (settings.showZipValidation !== undefined) row.show_zip_validation = settings.showZipValidation
  if (settings.showPropertyStep !== undefined) row.show_property_step = settings.showPropertyStep
  if (settings.showFrequencySelection !== undefined) row.show_frequency_selection = settings.showFrequencySelection
  if (settings.showSqftField !== undefined) row.show_sqft_field = settings.showSqftField
  if (settings.showPetsField !== undefined) row.show_pets_field = settings.showPetsField
  if (settings.showPropertyTypeField !== undefined) row.show_property_type_field = settings.showPropertyTypeField
  if (settings.showSpecialInstructions !== undefined) row.show_special_instructions = settings.showSpecialInstructions

  // Required fields
  if (settings.requireEmail !== undefined) row.require_email = settings.requireEmail
  if (settings.requireAddress !== undefined) row.require_address = settings.requireAddress

  // Default values
  if (settings.defaultBedrooms !== undefined) row.default_bedrooms = settings.defaultBedrooms
  if (settings.defaultBathrooms !== undefined) row.default_bathrooms = settings.defaultBathrooms
  if (settings.defaultFrequency !== undefined) row.default_frequency = settings.defaultFrequency

  // Scheduling
  if (settings.minLeadTimeHours !== undefined) row.min_lead_time_hours = settings.minLeadTimeHours
  if (settings.maxBookingDaysAhead !== undefined) row.max_booking_days_ahead = settings.maxBookingDaysAhead
  if (settings.timeSlotIntervalMinutes !== undefined) row.time_slot_interval_minutes = settings.timeSlotIntervalMinutes
  if (settings.showEstimatedDuration !== undefined) row.show_estimated_duration = settings.showEstimatedDuration
  if (settings.allowSameDayBooking !== undefined) row.allow_same_day_booking = settings.allowSameDayBooking
  if (settings.sameDayCutoffHour !== undefined) row.same_day_cutoff_hour = settings.sameDayCutoffHour

  // Pricing Display
  if (settings.showPricesOnServices !== undefined) row.show_prices_on_services = settings.showPricesOnServices
  if (settings.showPriceBreakdown !== undefined) row.show_price_breakdown = settings.showPriceBreakdown
  if (settings.showPriceDuringFlow !== undefined) row.show_price_during_flow = settings.showPriceDuringFlow
  if (settings.priceDisplayFormat !== undefined) row.price_display_format = settings.priceDisplayFormat
  if (settings.showDiscountBadge !== undefined) row.show_discount_badge = settings.showDiscountBadge

  // Payment
  if (settings.depositPercentage !== undefined) row.deposit_percentage = settings.depositPercentage
  if (settings.depositType !== undefined) row.deposit_type = settings.depositType
  if (settings.depositFixedAmount !== undefined) row.deposit_fixed_amount = settings.depositFixedAmount
  if (settings.showDepositExplanation !== undefined) row.show_deposit_explanation = settings.showDepositExplanation
  if (settings.acceptPaymentAtBooking !== undefined) row.accept_payment_at_booking = settings.acceptPaymentAtBooking
  if (settings.paymentMethods !== undefined) row.payment_methods = JSON.stringify(settings.paymentMethods)

  // Membership/Frequency
  if (settings.enableRecurring !== undefined) row.enable_recurring = settings.enableRecurring
  if (settings.defaultToRecurring !== undefined) row.default_to_recurring = settings.defaultToRecurring
  if (settings.recurringDiscountWeekly !== undefined) row.recurring_discount_weekly = settings.recurringDiscountWeekly
  if (settings.recurringDiscountBiweekly !== undefined) row.recurring_discount_biweekly = settings.recurringDiscountBiweekly
  if (settings.recurringDiscountMonthly !== undefined) row.recurring_discount_monthly = settings.recurringDiscountMonthly
  if (settings.showRecurringSavings !== undefined) row.show_recurring_savings = settings.showRecurringSavings
  if (settings.recurringBadgeTextWeekly !== undefined) row.recurring_badge_text_weekly = settings.recurringBadgeTextWeekly
  if (settings.recurringBadgeTextBiweekly !== undefined) row.recurring_badge_text_biweekly = settings.recurringBadgeTextBiweekly

  // Add-ons & Custom Fields
  if (settings.enableAddons !== undefined) row.enable_addons = settings.enableAddons
  if (settings.enableCustomFields !== undefined) row.enable_custom_fields = settings.enableCustomFields

  // Social Proof
  if (settings.showReviews !== undefined) row.show_reviews = settings.showReviews
  if (settings.showTrustBadges !== undefined) row.show_trust_badges = settings.showTrustBadges
  if (settings.trustBadges !== undefined) row.trust_badges = JSON.stringify(settings.trustBadges)
  if (settings.googleReviewsPlaceId !== undefined) row.google_reviews_place_id = settings.googleReviewsPlaceId

  // SEO & Analytics
  if (settings.metaTitle !== undefined) row.meta_title = settings.metaTitle
  if (settings.metaDescription !== undefined) row.meta_description = settings.metaDescription
  if (settings.googleAnalyticsId !== undefined) row.google_analytics_id = settings.googleAnalyticsId
  if (settings.facebookPixelId !== undefined) row.facebook_pixel_id = settings.facebookPixelId
  if (settings.customHeadCode !== undefined) row.custom_head_code = settings.customHeadCode

  // Notifications
  if (settings.sendConfirmationSms !== undefined) row.send_confirmation_sms = settings.sendConfirmationSms
  if (settings.sendConfirmationEmail !== undefined) row.send_confirmation_email = settings.sendConfirmationEmail
  if (settings.sendReminderSms !== undefined) row.send_reminder_sms = settings.sendReminderSms
  if (settings.reminderHoursBefore !== undefined) row.reminder_hours_before = settings.reminderHoursBefore

  return row
}

export function mapServiceAddonToRow(
  addon: Partial<ServiceAddon> & { businessId: string }
): Partial<ServiceAddonRow> {
  const row: Partial<ServiceAddonRow> = {
    business_id: addon.businessId,
  }

  if (addon.id !== undefined) row.id = addon.id
  if (addon.name !== undefined) row.name = addon.name
  if (addon.description !== undefined) row.description = addon.description
  if (addon.priceType !== undefined) row.price_type = addon.priceType
  if (addon.price !== undefined) row.price = addon.price
  if (addon.icon !== undefined) row.icon = addon.icon
  if (addon.displayOrder !== undefined) row.display_order = addon.displayOrder
  if (addon.isActive !== undefined) row.is_active = addon.isActive
  if (addon.availableForServices !== undefined) row.available_for_services = addon.availableForServices
  if (addon.isPopular !== undefined) row.is_popular = addon.isPopular
  if (addon.maxQuantity !== undefined) row.max_quantity = addon.maxQuantity

  return row
}

export function mapCustomBookingFieldToRow(
  field: Partial<CustomBookingField> & { businessId: string }
): Partial<CustomBookingFieldRow> {
  const row: Partial<CustomBookingFieldRow> = {
    business_id: field.businessId,
  }

  if (field.id !== undefined) row.id = field.id
  if (field.fieldKey !== undefined) row.field_key = field.fieldKey
  if (field.label !== undefined) row.label = field.label
  if (field.placeholder !== undefined) row.placeholder = field.placeholder
  if (field.helpText !== undefined) row.help_text = field.helpText
  if (field.fieldType !== undefined) row.field_type = field.fieldType
  if (field.options !== undefined) row.options = field.options ? JSON.stringify(field.options) : null
  if (field.isRequired !== undefined) row.is_required = field.isRequired
  if (field.minLength !== undefined) row.min_length = field.minLength
  if (field.maxLength !== undefined) row.max_length = field.maxLength
  if (field.minValue !== undefined) row.min_value = field.minValue
  if (field.maxValue !== undefined) row.max_value = field.maxValue
  if (field.pattern !== undefined) row.pattern = field.pattern
  if (field.displayOrder !== undefined) row.display_order = field.displayOrder
  if (field.showOnStep !== undefined) row.show_on_step = field.showOnStep
  if (field.width !== undefined) row.width = field.width
  if (field.showCondition !== undefined) row.show_condition = field.showCondition ? JSON.stringify(field.showCondition) : null
  if (field.isActive !== undefined) row.is_active = field.isActive

  return row
}

export function mapBlackoutDateToRow(
  blackoutDate: Partial<BlackoutDate> & { businessId: string }
): Partial<BlackoutDateRow> {
  const row: Partial<BlackoutDateRow> = {
    business_id: blackoutDate.businessId,
  }

  if (blackoutDate.id !== undefined) row.id = blackoutDate.id
  if (blackoutDate.date !== undefined) row.date = blackoutDate.date
  if (blackoutDate.reason !== undefined) row.reason = blackoutDate.reason
  if (blackoutDate.allDay !== undefined) row.all_day = blackoutDate.allDay
  if (blackoutDate.startTime !== undefined) row.start_time = blackoutDate.startTime
  if (blackoutDate.endTime !== undefined) row.end_time = blackoutDate.endTime

  return row
}

export function mapTimeSlotOverrideToRow(
  override: Partial<TimeSlotOverride> & { businessId: string }
): Partial<TimeSlotOverrideRow> {
  const row: Partial<TimeSlotOverrideRow> = {
    business_id: override.businessId,
  }

  if (override.id !== undefined) row.id = override.id
  if (override.date !== undefined) row.date = override.date
  if (override.slots !== undefined) row.slots = JSON.stringify(override.slots)

  return row
}
