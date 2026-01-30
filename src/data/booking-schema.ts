// ============================================
// BOOKING PAGE CUSTOMIZATION SCHEMA
// TypeScript types for deep booking interface customization
// ============================================

// ============================================
// ENUMS AND LITERAL TYPES
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
export type PaymentMethod = 'card' | 'cash' | 'check'
export type TrustBadge = 'satisfaction' | 'insured' | 'background_checked' | 'eco_friendly' | 'licensed'
export type FrequencyType = 'one_time' | 'weekly' | 'biweekly' | 'monthly'
export type AddonPriceType = 'fixed' | 'per_room' | 'per_hour' | 'percentage'
export type FieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'number' | 'date' | 'file' | 'phone' | 'email'
export type FieldWidth = 'full' | 'half'
export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than'

// ============================================
// BOOKING PAGE SETTINGS
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
  trustBadges: TrustBadge[]
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
  availableForServices: string[] | null

  // Behavior
  isPopular: boolean
  maxQuantity: number

  createdAt: Date
  updatedAt: Date
}

// ============================================
// CUSTOM FORM FIELDS
// ============================================

export interface FieldOption {
  value: string
  label: string
}

export interface ShowCondition {
  field: string
  operator: ConditionOperator
  value: string | number | boolean
}

export interface CustomBookingField {
  id: string
  businessId: string

  // Field definition
  fieldKey: string
  label: string
  placeholder: string | null
  helpText: string | null

  // Field type
  fieldType: FieldType

  // Options (for select, radio, checkbox)
  options: FieldOption[] | null

  // Validation
  isRequired: boolean
  minLength: number | null
  maxLength: number | null
  minValue: number | null
  maxValue: number | null
  pattern: string | null

  // Display
  displayOrder: number
  showOnStep: number
  width: FieldWidth

  // Conditional display
  showCondition: ShowCondition | null

  isActive: boolean

  createdAt: Date
  updatedAt: Date
}

// ============================================
// BOOKING ADDON SELECTIONS
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
// ============================================

export interface TimeSlot {
  time: string // HH:MM format
  available: boolean
  capacity: number
}

export interface TimeSlotOverride {
  id: string
  businessId: string

  date: string // ISO date string (YYYY-MM-DD)
  slots: TimeSlot[]

  createdAt: Date
}

// ============================================
// AVAILABILITY WITH CAPACITY
// ============================================

export interface AvailabilitySlot {
  id: string
  businessId: string
  dayOfWeek: number // 0-6 (Sunday-Saturday)
  startTime: string // HH:MM format
  endTime: string // HH:MM format
  isActive: boolean
  capacity: number
  bufferMinutes: number
}

// ============================================
// DEFAULT VALUES
// ============================================

export const defaultBookingPageSettings: Omit<BookingPageSettings, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> = {
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

  // Content/Copy - Step headlines
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
// DEFAULT ADD-ONS
// ============================================

export const defaultServiceAddons: Omit<ServiceAddon, 'id' | 'businessId' | 'createdAt' | 'updatedAt'>[] = [
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
    maxQuantity: 10,
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
// HELPER TYPE FOR FORM STATE
// ============================================

export type BookingSettingsFormData = Omit<BookingPageSettings, 'id' | 'businessId' | 'createdAt' | 'updatedAt'>

export type ServiceAddonFormData = Omit<ServiceAddon, 'id' | 'businessId' | 'createdAt' | 'updatedAt'>

export type CustomFieldFormData = Omit<CustomBookingField, 'id' | 'businessId' | 'createdAt' | 'updatedAt'>

export type BlackoutDateFormData = Omit<BlackoutDate, 'id' | 'businessId' | 'createdAt'>
