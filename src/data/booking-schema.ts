// ============================================
// VISTRIAL - BOOKING CUSTOMIZATION SCHEMA
// TypeScript types for deep booking customization
// ============================================

// ============================================
// ENUMS & UNION TYPES
// ============================================

export type LogoPosition = 'left' | 'center' | 'right'
export type LogoSize = 'small' | 'medium' | 'large'
export type ButtonStyle = 'rounded' | 'pill' | 'square'
export type ButtonSize = 'small' | 'medium' | 'large'
export type LayoutStyle = 'card' | 'minimal' | 'full-width'
export type ProgressBarStyle = 'steps' | 'bar' | 'dots' | 'none'
export type SidebarPosition = 'left' | 'right'
export type HeaderStyle = 'colored' | 'white' | 'transparent'
export type PriceDisplayFormat = 'from' | 'fixed' | 'range' | 'none'
export type DepositType = 'percentage' | 'fixed'
export type FrequencyType = 'one-time' | 'weekly' | 'biweekly' | 'monthly'
export type PaymentMethod = 'card' | 'cash' | 'check'
export type TrustBadgeType = 'satisfaction' | 'insured' | 'background_checked' | 'eco_friendly' | 'licensed'

// Addon pricing types
export type AddonPriceType = 'fixed' | 'per_room' | 'per_hour' | 'percentage'

// Custom field types
export type CustomFieldType = 
  | 'text' 
  | 'textarea' 
  | 'select' 
  | 'checkbox' 
  | 'radio' 
  | 'number' 
  | 'date' 
  | 'file' 
  | 'phone' 
  | 'email'

export type FieldWidth = 'full' | 'half'

// Condition operators for conditional field display
export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than'

// ============================================
// JSONB TYPES
// ============================================

export interface SelectOption {
  value: string
  label: string
}

export interface ShowCondition {
  field: string
  operator: ConditionOperator
  value: string | number | boolean
}

export interface TimeSlot {
  time: string // e.g., "09:00"
  available: boolean
  capacity?: number
}

// ============================================
// BOOKING PAGE SETTINGS
// Main configuration for booking interface
// ============================================

export interface BookingPageSettings {
  id: string
  businessId: string

  // ========== BRANDING ==========
  // Colors
  primaryColor: string
  secondaryColor: string
  accentColor: string
  backgroundColor: string
  cardBackgroundColor: string
  textColor: string
  textMutedColor: string

  // Logo & Images
  logoUrl: string | null
  logoPosition: LogoPosition
  logoSize: LogoSize
  heroImageUrl: string | null
  faviconUrl: string | null

  // Typography
  fontFamily: string
  headingFontFamily: string | null
  fontSizeBase: string

  // Button Styles
  buttonStyle: ButtonStyle
  buttonSize: ButtonSize

  // ========== LAYOUT ==========
  layoutStyle: LayoutStyle
  progressBarStyle: ProgressBarStyle
  showSidebarSummary: boolean
  sidebarPosition: SidebarPosition
  maxWidth: string

  // ========== HEADER ==========
  headerStyle: HeaderStyle
  showBusinessName: boolean
  showBusinessPhone: boolean
  showBusinessEmail: boolean
  headerTagline: string | null

  // ========== FOOTER ==========
  showFooter: boolean
  showPoweredBy: boolean
  footerText: string | null

  // ========== CONTENT/COPY ==========
  // Step headlines
  step1Headline: string
  step1Subheadline: string
  step2Headline: string
  step2Subheadline: string
  step3Headline: string
  step3Subheadline: string
  step4Headline: string
  step4Subheadline: string
  step5Headline: string
  step5Subheadline: string

  // Confirmation
  confirmationHeadline: string
  confirmationSubheadline: string
  confirmationMessage: string | null

  // Custom messages
  serviceAreaErrorMessage: string
  noAvailabilityMessage: string

  // ========== BEHAVIOR ==========
  // Steps to show
  showZipValidation: boolean
  showPropertyStep: boolean
  showFrequencySelection: boolean
  showSqftField: boolean
  showPetsField: boolean
  showPropertyTypeField: boolean
  showSpecialInstructions: boolean

  // Required fields
  requireEmail: boolean
  requireAddress: boolean

  // Default values
  defaultBedrooms: number
  defaultBathrooms: number
  defaultFrequency: FrequencyType

  // ========== SCHEDULING ==========
  minLeadTimeHours: number
  maxBookingDaysAhead: number
  timeSlotIntervalMinutes: number
  showEstimatedDuration: boolean
  allowSameDayBooking: boolean
  sameDayCutoffHour: number

  // ========== PRICING DISPLAY ==========
  showPricesOnServices: boolean
  showPriceBreakdown: boolean
  showPriceDuringFlow: boolean
  priceDisplayFormat: PriceDisplayFormat
  showDiscountBadge: boolean

  // ========== PAYMENT ==========
  depositPercentage: number
  depositType: DepositType
  depositFixedAmount: number | null
  showDepositExplanation: boolean
  acceptPaymentAtBooking: boolean
  paymentMethods: PaymentMethod[]

  // ========== MEMBERSHIP/FREQUENCY ==========
  enableRecurring: boolean
  defaultToRecurring: boolean
  recurringDiscountWeekly: number
  recurringDiscountBiweekly: number
  recurringDiscountMonthly: number
  showRecurringSavings: boolean
  recurringBadgeTextWeekly: string
  recurringBadgeTextBiweekly: string

  // ========== ADD-ONS ==========
  enableAddons: boolean

  // ========== CUSTOM FIELDS ==========
  enableCustomFields: boolean

  // ========== SOCIAL PROOF ==========
  showReviews: boolean
  showTrustBadges: boolean
  trustBadges: TrustBadgeType[]
  googleReviewsPlaceId: string | null

  // ========== SEO & ANALYTICS ==========
  metaTitle: string | null
  metaDescription: string | null
  googleAnalyticsId: string | null
  facebookPixelId: string | null
  customHeadCode: string | null

  // ========== NOTIFICATIONS ==========
  sendConfirmationSms: boolean
  sendConfirmationEmail: boolean
  sendReminderSms: boolean
  reminderHoursBefore: number

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

// ============================================
// SERVICE ADD-ONS
// Optional extras customers can add
// ============================================

export interface ServiceAddon {
  id: string
  businessId: string

  name: string
  description: string | null

  // Pricing
  priceType: AddonPriceType
  price: number

  // Display
  icon: string | null
  displayOrder: number

  // Availability
  isActive: boolean
  availableForServices: string[] | null // NULL = all services

  // Behavior
  isPopular: boolean
  maxQuantity: number

  createdAt: Date
  updatedAt: Date
}

// ============================================
// CUSTOM FORM FIELDS
// Additional questions for booking
// ============================================

export interface CustomBookingField {
  id: string
  businessId: string

  // Field definition
  fieldKey: string
  label: string
  placeholder: string | null
  helpText: string | null

  // Field type
  fieldType: CustomFieldType

  // Options (for select, radio, checkbox)
  options: SelectOption[] | null

  // Validation
  isRequired: boolean
  minLength: number | null
  maxLength: number | null
  minValue: number | null
  maxValue: number | null
  pattern: string | null // regex

  // Display
  displayOrder: number
  showOnStep: number // which step (1-5)
  width: FieldWidth

  // Conditional display
  showCondition: ShowCondition | null

  isActive: boolean

  createdAt: Date
  updatedAt: Date
}

// ============================================
// BOOKING ADDON SELECTIONS
// Track which addons were selected per booking
// ============================================

export interface BookingAddon {
  id: string
  bookingId: string
  addonId: string
  quantity: number
  unitPrice: number
  totalPrice: number
  createdAt: Date
}

// ============================================
// BOOKING CUSTOM FIELD VALUES
// Store responses to custom fields
// ============================================

export interface BookingCustomFieldValue {
  id: string
  bookingId: string
  fieldId: string
  fieldKey: string
  value: string | null
  createdAt: Date
}

// ============================================
// BLACKOUT DATES
// Days when booking is not available
// ============================================

export interface BlackoutDate {
  id: string
  businessId: string

  date: string // ISO date string (YYYY-MM-DD)
  reason: string | null

  // Can be full day or specific times
  allDay: boolean
  startTime: string | null // HH:MM format
  endTime: string | null // HH:MM format

  createdAt: Date
}

// ============================================
// TIME SLOT OVERRIDES
// Custom availability for specific dates
// ============================================

export interface TimeSlotOverride {
  id: string
  businessId: string

  date: string // ISO date string (YYYY-MM-DD)
  slots: TimeSlot[]

  createdAt: Date
}

// ============================================
// AVAILABILITY EXTENSION
// Capacity settings (extends existing table)
// ============================================

export interface AvailabilityCapacity {
  capacity: number
  bufferMinutes: number
}

// ============================================
// DEFAULT VALUES
// Used for creating new settings
// ============================================

export const DEFAULT_BOOKING_PAGE_SETTINGS: Omit<BookingPageSettings, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> = {
  // Branding - Colors
  primaryColor: '#7c3aed',
  secondaryColor: '#4f46e5',
  accentColor: '#10b981',
  backgroundColor: '#f8fafc',
  cardBackgroundColor: '#ffffff',
  textColor: '#1e293b',
  textMutedColor: '#64748b',

  // Logo & Images
  logoUrl: null,
  logoPosition: 'left',
  logoSize: 'medium',
  heroImageUrl: null,
  faviconUrl: null,

  // Typography
  fontFamily: 'Inter',
  headingFontFamily: null,
  fontSizeBase: '16px',

  // Button Styles
  buttonStyle: 'rounded',
  buttonSize: 'large',

  // Layout
  layoutStyle: 'card',
  progressBarStyle: 'steps',
  showSidebarSummary: true,
  sidebarPosition: 'right',
  maxWidth: '1200px',

  // Header
  headerStyle: 'colored',
  showBusinessName: true,
  showBusinessPhone: true,
  showBusinessEmail: false,
  headerTagline: null,

  // Footer
  showFooter: true,
  showPoweredBy: true,
  footerText: null,

  // Step headlines
  step1Headline: 'Select a Service',
  step1Subheadline: 'Choose the type of cleaning you need',
  step2Headline: 'Property Details',
  step2Subheadline: 'Tell us about your home',
  step3Headline: 'Choose Date & Time',
  step3Subheadline: 'When would you like us to come?',
  step4Headline: 'Contact Information',
  step4Subheadline: 'Where should we come and how can we reach you?',
  step5Headline: 'Review & Book',
  step5Subheadline: 'Please confirm your booking details',

  // Confirmation
  confirmationHeadline: "You're All Set!",
  confirmationSubheadline: 'Your cleaning has been scheduled',
  confirmationMessage: null,

  // Custom messages
  serviceAreaErrorMessage: "Sorry, we don't service this area yet.",
  noAvailabilityMessage: 'No available times for this date.',

  // Behavior - Steps to show
  showZipValidation: true,
  showPropertyStep: true,
  showFrequencySelection: true,
  showSqftField: false,
  showPetsField: true,
  showPropertyTypeField: false,
  showSpecialInstructions: true,

  // Required fields
  requireEmail: true,
  requireAddress: true,

  // Default values
  defaultBedrooms: 3,
  defaultBathrooms: 2,
  defaultFrequency: 'biweekly',

  // Scheduling
  minLeadTimeHours: 24,
  maxBookingDaysAhead: 60,
  timeSlotIntervalMinutes: 60,
  showEstimatedDuration: true,
  allowSameDayBooking: false,
  sameDayCutoffHour: 12,

  // Pricing Display
  showPricesOnServices: true,
  showPriceBreakdown: true,
  showPriceDuringFlow: true,
  priceDisplayFormat: 'from',
  showDiscountBadge: true,

  // Payment
  depositPercentage: 25,
  depositType: 'percentage',
  depositFixedAmount: null,
  showDepositExplanation: true,
  acceptPaymentAtBooking: true,
  paymentMethods: ['card'],

  // Membership/Frequency
  enableRecurring: true,
  defaultToRecurring: false,
  recurringDiscountWeekly: 15,
  recurringDiscountBiweekly: 10,
  recurringDiscountMonthly: 5,
  showRecurringSavings: true,
  recurringBadgeTextWeekly: 'Best Value',
  recurringBadgeTextBiweekly: 'Popular',

  // Add-ons
  enableAddons: true,

  // Custom Fields
  enableCustomFields: false,

  // Social Proof
  showReviews: false,
  showTrustBadges: true,
  trustBadges: ['satisfaction', 'insured', 'background_checked'],
  googleReviewsPlaceId: null,

  // SEO & Analytics
  metaTitle: null,
  metaDescription: null,
  googleAnalyticsId: null,
  facebookPixelId: null,
  customHeadCode: null,

  // Notifications
  sendConfirmationSms: true,
  sendConfirmationEmail: true,
  sendReminderSms: true,
  reminderHoursBefore: 24,
}

// ============================================
// DEFAULT SERVICE ADDONS
// Common addons for cleaning businesses
// ============================================

export const DEFAULT_SERVICE_ADDONS: Omit<ServiceAddon, 'id' | 'businessId' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Inside Fridge',
    description: 'Deep clean inside refrigerator',
    priceType: 'fixed',
    price: 35,
    icon: 'Refrigerator',
    displayOrder: 1,
    isActive: true,
    availableForServices: null,
    isPopular: true,
    maxQuantity: 1,
  },
  {
    name: 'Inside Oven',
    description: 'Deep clean inside oven',
    priceType: 'fixed',
    price: 35,
    icon: 'Flame',
    displayOrder: 2,
    isActive: true,
    availableForServices: null,
    isPopular: true,
    maxQuantity: 1,
  },
  {
    name: 'Inside Cabinets',
    description: 'Wipe down inside all cabinets',
    priceType: 'fixed',
    price: 45,
    icon: 'SquareStack',
    displayOrder: 3,
    isActive: true,
    availableForServices: null,
    isPopular: false,
    maxQuantity: 1,
  },
  {
    name: 'Laundry',
    description: 'Wash, dry, and fold laundry',
    priceType: 'fixed',
    price: 30,
    icon: 'Shirt',
    displayOrder: 4,
    isActive: true,
    availableForServices: null,
    isPopular: false,
    maxQuantity: 1,
  },
  {
    name: 'Dishes',
    description: 'Wash and put away dishes',
    priceType: 'fixed',
    price: 20,
    icon: 'UtensilsCrossed',
    displayOrder: 5,
    isActive: true,
    availableForServices: null,
    isPopular: false,
    maxQuantity: 1,
  },
  {
    name: 'Windows (Interior)',
    description: 'Clean interior window glass',
    priceType: 'per_room',
    price: 15,
    icon: 'AppWindow',
    displayOrder: 6,
    isActive: true,
    availableForServices: null,
    isPopular: false,
    maxQuantity: 1,
  },
  {
    name: 'Garage Sweep',
    description: 'Sweep and organize garage',
    priceType: 'fixed',
    price: 40,
    icon: 'Warehouse',
    displayOrder: 7,
    isActive: true,
    availableForServices: null,
    isPopular: false,
    maxQuantity: 1,
  },
  {
    name: 'Patio/Deck',
    description: 'Sweep and wipe outdoor furniture',
    priceType: 'fixed',
    price: 35,
    icon: 'Sun',
    displayOrder: 8,
    isActive: true,
    availableForServices: null,
    isPopular: false,
    maxQuantity: 1,
  },
]

// ============================================
// FORM INPUT TYPES (for form handling)
// ============================================

export type BookingPageSettingsInput = Partial<Omit<BookingPageSettings, 'id' | 'businessId' | 'createdAt' | 'updatedAt'>>

export type ServiceAddonInput = Omit<ServiceAddon, 'id' | 'businessId' | 'createdAt' | 'updatedAt'>

export type CustomBookingFieldInput = Omit<CustomBookingField, 'id' | 'businessId' | 'createdAt' | 'updatedAt'>

export type BlackoutDateInput = Omit<BlackoutDate, 'id' | 'businessId' | 'createdAt'>

export type TimeSlotOverrideInput = Omit<TimeSlotOverride, 'id' | 'businessId' | 'createdAt'>

// ============================================
// API RESPONSE TYPES
// ============================================

export interface BookingPageSettingsResponse {
  settings: BookingPageSettings
  addons: ServiceAddon[]
  customFields: CustomBookingField[]
}

export interface AvailabilityCheckRequest {
  businessId: string
  date: string
  serviceId?: string
}

export interface AvailabilityCheckResponse {
  date: string
  available: boolean
  slots: TimeSlot[]
  isBlackoutDate: boolean
  blackoutReason?: string
}

// ============================================
// VALIDATION HELPERS
// ============================================

export const isValidHexColor = (color: string): boolean => {
  return /^#[0-9A-Fa-f]{6}$/.test(color)
}

export const isValidTimeFormat = (time: string): boolean => {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time)
}

export const isValidDateFormat = (date: string): boolean => {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
}

// ============================================
// FREQUENCY HELPERS
// ============================================

export const FREQUENCY_OPTIONS: { value: FrequencyType; label: string; discount?: number }[] = [
  { value: 'one-time', label: 'One Time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 Weeks' },
  { value: 'monthly', label: 'Monthly' },
]

export const getFrequencyDiscount = (
  frequency: FrequencyType,
  settings: Pick<BookingPageSettings, 'recurringDiscountWeekly' | 'recurringDiscountBiweekly' | 'recurringDiscountMonthly'>
): number => {
  switch (frequency) {
    case 'weekly':
      return settings.recurringDiscountWeekly
    case 'biweekly':
      return settings.recurringDiscountBiweekly
    case 'monthly':
      return settings.recurringDiscountMonthly
    default:
      return 0
  }
}

// ============================================
// PRICE CALCULATION HELPERS
// ============================================

export const calculateAddonTotal = (
  addon: ServiceAddon,
  quantity: number,
  roomCount?: number
): number => {
  switch (addon.priceType) {
    case 'fixed':
      return addon.price * quantity
    case 'per_room':
      return addon.price * (roomCount || 1) * quantity
    case 'per_hour':
      return addon.price * quantity // quantity represents hours
    case 'percentage':
      return 0 // Needs base price to calculate
    default:
      return addon.price * quantity
  }
}

export const calculateDeposit = (
  totalPrice: number,
  settings: Pick<BookingPageSettings, 'depositType' | 'depositPercentage' | 'depositFixedAmount'>
): number => {
  if (settings.depositType === 'fixed' && settings.depositFixedAmount) {
    return Math.min(settings.depositFixedAmount, totalPrice)
  }
  return (totalPrice * settings.depositPercentage) / 100
}

// ============================================
// BOOKING STEP CONFIGURATION
// ============================================

export interface BookingStep {
  step: number
  headline: string
  subheadline: string
  isVisible: boolean
}

export const getBookingSteps = (settings: BookingPageSettings): BookingStep[] => {
  return [
    {
      step: 1,
      headline: settings.step1Headline,
      subheadline: settings.step1Subheadline,
      isVisible: true, // Service selection is always visible
    },
    {
      step: 2,
      headline: settings.step2Headline,
      subheadline: settings.step2Subheadline,
      isVisible: settings.showPropertyStep,
    },
    {
      step: 3,
      headline: settings.step3Headline,
      subheadline: settings.step3Subheadline,
      isVisible: true, // Date/time selection is always visible
    },
    {
      step: 4,
      headline: settings.step4Headline,
      subheadline: settings.step4Subheadline,
      isVisible: true, // Contact info is always visible
    },
    {
      step: 5,
      headline: settings.step5Headline,
      subheadline: settings.step5Subheadline,
      isVisible: true, // Review is always visible
    },
  ].filter((step) => step.isVisible)
}

// ============================================
// TRUST BADGE CONFIGURATION
// ============================================

export interface TrustBadgeConfig {
  type: TrustBadgeType
  label: string
  icon: string
  description: string
}

export const TRUST_BADGE_CONFIG: Record<TrustBadgeType, TrustBadgeConfig> = {
  satisfaction: {
    type: 'satisfaction',
    label: '100% Satisfaction',
    icon: 'ThumbsUp',
    description: 'Guaranteed satisfaction or we make it right',
  },
  insured: {
    type: 'insured',
    label: 'Fully Insured',
    icon: 'Shield',
    description: 'Protected by comprehensive liability insurance',
  },
  background_checked: {
    type: 'background_checked',
    label: 'Background Checked',
    icon: 'UserCheck',
    description: 'All team members pass thorough background checks',
  },
  eco_friendly: {
    type: 'eco_friendly',
    label: 'Eco-Friendly',
    icon: 'Leaf',
    description: 'Using environmentally safe cleaning products',
  },
  licensed: {
    type: 'licensed',
    label: 'Licensed & Bonded',
    icon: 'Award',
    description: 'Fully licensed and bonded business',
  },
}
