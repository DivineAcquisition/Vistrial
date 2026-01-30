// ============================================
// MOCK DATA FOR BOOKING CUSTOMIZATION
// Sample data for development and testing
// ============================================

import type {
  BookingPageSettings,
  ServiceAddon,
  CustomBookingField,
  BlackoutDate,
  TimeSlotOverride,
} from './booking-schema'

// ============================================
// MOCK BUSINESS ID
// ============================================

export const MOCK_BUSINESS_ID = '550e8400-e29b-41d4-a716-446655440000'

// ============================================
// MOCK BOOKING PAGE SETTINGS
// ============================================

export const mockBookingPageSettings: BookingPageSettings = {
  id: '650e8400-e29b-41d4-a716-446655440001',
  businessId: MOCK_BUSINESS_ID,

  // Branding - Colors
  primaryColor: '#7c3aed',
  secondaryColor: '#4f46e5',
  accentColor: '#10b981',
  backgroundColor: '#f8fafc',
  cardBackgroundColor: '#ffffff',
  textColor: '#1e293b',
  textMutedColor: '#64748b',

  // Logo & Images
  logoUrl: 'https://example.com/logo.png',
  logoPosition: 'left',
  logoSize: 'medium',
  heroImageUrl: null,
  faviconUrl: null,

  // Typography
  fontFamily: 'Inter',
  headingFontFamily: 'Poppins',
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
  headerTagline: 'Book your cleaning in 60 seconds',

  // Footer
  showFooter: true,
  showPoweredBy: true,
  footerText: 'Sparkle Clean Services - Trusted by 5,000+ happy customers',

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
  confirmationMessage: "We've sent you a confirmation email with all the details. Our team will arrive on time and ready to make your home sparkle!",

  // Custom messages
  serviceAreaErrorMessage: "Sorry, we don't service this area yet. Please call us at (555) 123-4567 and we'll do our best to help!",
  noAvailabilityMessage: 'No available times for this date. Try selecting another day.',

  // Behavior
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
  recurringBadgeTextWeekly: 'Best Value - 15% Off',
  recurringBadgeTextBiweekly: 'Most Popular - 10% Off',

  // Add-ons
  enableAddons: true,

  // Custom Fields
  enableCustomFields: true,

  // Social Proof
  showReviews: true,
  showTrustBadges: true,
  trustBadges: ['satisfaction', 'insured', 'background_checked'],
  googleReviewsPlaceId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',

  // SEO & Analytics
  metaTitle: 'Book Your Cleaning | Sparkle Clean Services',
  metaDescription: 'Book professional house cleaning in minutes. Trusted by thousands. Background-checked cleaners. Satisfaction guaranteed.',
  googleAnalyticsId: 'G-XXXXXXXXXX',
  facebookPixelId: null,
  customHeadCode: null,

  // Notifications
  sendConfirmationSms: true,
  sendConfirmationEmail: true,
  sendReminderSms: true,
  reminderHoursBefore: 24,

  // Timestamps
  createdAt: new Date('2024-01-15T10:00:00Z'),
  updatedAt: new Date('2024-01-20T14:30:00Z'),
}

// ============================================
// MOCK SERVICE ADDONS
// ============================================

export const mockServiceAddons: ServiceAddon[] = [
  {
    id: '750e8400-e29b-41d4-a716-446655440001',
    businessId: MOCK_BUSINESS_ID,
    name: 'Inside Fridge',
    description: 'Deep clean inside refrigerator including shelves and drawers',
    priceType: 'fixed',
    price: 35,
    icon: 'Refrigerator',
    displayOrder: 1,
    isActive: true,
    availableForServices: null,
    isPopular: true,
    maxQuantity: 1,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '750e8400-e29b-41d4-a716-446655440002',
    businessId: MOCK_BUSINESS_ID,
    name: 'Inside Oven',
    description: 'Deep clean inside oven including racks',
    priceType: 'fixed',
    price: 35,
    icon: 'Flame',
    displayOrder: 2,
    isActive: true,
    availableForServices: null,
    isPopular: true,
    maxQuantity: 1,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '750e8400-e29b-41d4-a716-446655440003',
    businessId: MOCK_BUSINESS_ID,
    name: 'Inside Cabinets',
    description: 'Wipe down inside all kitchen cabinets',
    priceType: 'fixed',
    price: 45,
    icon: 'SquareStack',
    displayOrder: 3,
    isActive: true,
    availableForServices: null,
    isPopular: false,
    maxQuantity: 1,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '750e8400-e29b-41d4-a716-446655440004',
    businessId: MOCK_BUSINESS_ID,
    name: 'Laundry',
    description: 'Wash, dry, and fold laundry (up to 2 loads)',
    priceType: 'fixed',
    price: 30,
    icon: 'Shirt',
    displayOrder: 4,
    isActive: true,
    availableForServices: null,
    isPopular: false,
    maxQuantity: 3,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '750e8400-e29b-41d4-a716-446655440005',
    businessId: MOCK_BUSINESS_ID,
    name: 'Dishes',
    description: 'Wash and put away all dishes',
    priceType: 'fixed',
    price: 20,
    icon: 'UtensilsCrossed',
    displayOrder: 5,
    isActive: true,
    availableForServices: null,
    isPopular: false,
    maxQuantity: 1,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '750e8400-e29b-41d4-a716-446655440006',
    businessId: MOCK_BUSINESS_ID,
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
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '750e8400-e29b-41d4-a716-446655440007',
    businessId: MOCK_BUSINESS_ID,
    name: 'Garage Sweep',
    description: 'Sweep garage floor and organize items',
    priceType: 'fixed',
    price: 40,
    icon: 'Warehouse',
    displayOrder: 7,
    isActive: true,
    availableForServices: null,
    isPopular: false,
    maxQuantity: 1,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '750e8400-e29b-41d4-a716-446655440008',
    businessId: MOCK_BUSINESS_ID,
    name: 'Patio/Deck',
    description: 'Sweep deck and wipe outdoor furniture',
    priceType: 'fixed',
    price: 35,
    icon: 'Sun',
    displayOrder: 8,
    isActive: true,
    availableForServices: null,
    isPopular: false,
    maxQuantity: 1,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
]

// ============================================
// MOCK CUSTOM BOOKING FIELDS
// ============================================

export const mockCustomBookingFields: CustomBookingField[] = [
  {
    id: '850e8400-e29b-41d4-a716-446655440001',
    businessId: MOCK_BUSINESS_ID,
    fieldKey: 'access_method',
    label: 'How will we access your home?',
    placeholder: null,
    helpText: 'Let us know how our team can enter your property',
    fieldType: 'select',
    options: [
      { value: 'be_home', label: "I'll be home" },
      { value: 'doorman', label: 'Doorman/Concierge' },
      { value: 'lockbox', label: 'Lockbox' },
      { value: 'hidden_key', label: 'Hidden key' },
      { value: 'smart_lock', label: 'Smart lock/code' },
    ],
    isRequired: true,
    minLength: null,
    maxLength: null,
    minValue: null,
    maxValue: null,
    pattern: null,
    displayOrder: 1,
    showOnStep: 4,
    width: 'full',
    showCondition: null,
    isActive: true,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '850e8400-e29b-41d4-a716-446655440002',
    businessId: MOCK_BUSINESS_ID,
    fieldKey: 'lockbox_code',
    label: 'Lockbox Code',
    placeholder: 'Enter your lockbox code',
    helpText: 'This will be kept confidential',
    fieldType: 'text',
    options: null,
    isRequired: true,
    minLength: 4,
    maxLength: 10,
    minValue: null,
    maxValue: null,
    pattern: '^[0-9]+$',
    displayOrder: 2,
    showOnStep: 4,
    width: 'half',
    showCondition: { field: 'access_method', operator: 'equals', value: 'lockbox' },
    isActive: true,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '850e8400-e29b-41d4-a716-446655440003',
    businessId: MOCK_BUSINESS_ID,
    fieldKey: 'parking_info',
    label: 'Parking Instructions',
    placeholder: 'e.g., Street parking available, use driveway, etc.',
    helpText: 'Help our team find the best place to park',
    fieldType: 'textarea',
    options: null,
    isRequired: false,
    minLength: null,
    maxLength: 500,
    minValue: null,
    maxValue: null,
    pattern: null,
    displayOrder: 3,
    showOnStep: 4,
    width: 'full',
    showCondition: null,
    isActive: true,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '850e8400-e29b-41d4-a716-446655440004',
    businessId: MOCK_BUSINESS_ID,
    fieldKey: 'has_alarm',
    label: 'Do you have a security alarm?',
    placeholder: null,
    helpText: null,
    fieldType: 'checkbox',
    options: null,
    isRequired: false,
    minLength: null,
    maxLength: null,
    minValue: null,
    maxValue: null,
    pattern: null,
    displayOrder: 4,
    showOnStep: 4,
    width: 'half',
    showCondition: null,
    isActive: true,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '850e8400-e29b-41d4-a716-446655440005',
    businessId: MOCK_BUSINESS_ID,
    fieldKey: 'alarm_code',
    label: 'Alarm Code',
    placeholder: 'Enter alarm code',
    helpText: 'We will arm it when we leave',
    fieldType: 'text',
    options: null,
    isRequired: true,
    minLength: 4,
    maxLength: 8,
    minValue: null,
    maxValue: null,
    pattern: null,
    displayOrder: 5,
    showOnStep: 4,
    width: 'half',
    showCondition: { field: 'has_alarm', operator: 'equals', value: true },
    isActive: true,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '850e8400-e29b-41d4-a716-446655440006',
    businessId: MOCK_BUSINESS_ID,
    fieldKey: 'referral_source',
    label: 'How did you hear about us?',
    placeholder: null,
    helpText: 'Optional - helps us improve our services',
    fieldType: 'radio',
    options: [
      { value: 'google', label: 'Google Search' },
      { value: 'facebook', label: 'Facebook' },
      { value: 'instagram', label: 'Instagram' },
      { value: 'friend', label: 'Friend/Family' },
      { value: 'nextdoor', label: 'Nextdoor' },
      { value: 'other', label: 'Other' },
    ],
    isRequired: false,
    minLength: null,
    maxLength: null,
    minValue: null,
    maxValue: null,
    pattern: null,
    displayOrder: 6,
    showOnStep: 4,
    width: 'full',
    showCondition: null,
    isActive: true,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
]

// ============================================
// MOCK BLACKOUT DATES
// ============================================

export const mockBlackoutDates: BlackoutDate[] = [
  {
    id: '950e8400-e29b-41d4-a716-446655440001',
    businessId: MOCK_BUSINESS_ID,
    date: '2024-12-25',
    reason: 'Christmas Day - Office Closed',
    allDay: true,
    startTime: null,
    endTime: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '950e8400-e29b-41d4-a716-446655440002',
    businessId: MOCK_BUSINESS_ID,
    date: '2024-12-26',
    reason: 'Day After Christmas',
    allDay: true,
    startTime: null,
    endTime: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '950e8400-e29b-41d4-a716-446655440003',
    businessId: MOCK_BUSINESS_ID,
    date: '2025-01-01',
    reason: "New Year's Day",
    allDay: true,
    startTime: null,
    endTime: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '950e8400-e29b-41d4-a716-446655440004',
    businessId: MOCK_BUSINESS_ID,
    date: '2024-07-04',
    reason: 'Independence Day',
    allDay: true,
    startTime: null,
    endTime: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '950e8400-e29b-41d4-a716-446655440005',
    businessId: MOCK_BUSINESS_ID,
    date: '2024-11-28',
    reason: 'Thanksgiving Day',
    allDay: true,
    startTime: null,
    endTime: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: '950e8400-e29b-41d4-a716-446655440006',
    businessId: MOCK_BUSINESS_ID,
    date: '2024-03-15',
    reason: 'Team Training Day - Limited Availability',
    allDay: false,
    startTime: '08:00',
    endTime: '12:00',
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
]

// ============================================
// MOCK TIME SLOT OVERRIDES
// ============================================

export const mockTimeSlotOverrides: TimeSlotOverride[] = [
  {
    id: 'a50e8400-e29b-41d4-a716-446655440001',
    businessId: MOCK_BUSINESS_ID,
    date: '2024-02-14', // Valentine's Day - extended hours
    slots: [
      { time: '07:00', available: true, capacity: 2 },
      { time: '08:00', available: true, capacity: 3 },
      { time: '09:00', available: true, capacity: 3 },
      { time: '10:00', available: true, capacity: 3 },
      { time: '11:00', available: true, capacity: 3 },
      { time: '12:00', available: true, capacity: 2 },
      { time: '13:00', available: true, capacity: 3 },
      { time: '14:00', available: true, capacity: 3 },
      { time: '15:00', available: true, capacity: 3 },
      { time: '16:00', available: true, capacity: 3 },
      { time: '17:00', available: true, capacity: 2 },
      { time: '18:00', available: true, capacity: 1 },
    ],
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: 'a50e8400-e29b-41d4-a716-446655440002',
    businessId: MOCK_BUSINESS_ID,
    date: '2024-03-17', // St. Patrick's Day - reduced capacity
    slots: [
      { time: '09:00', available: true, capacity: 1 },
      { time: '10:00', available: true, capacity: 1 },
      { time: '11:00', available: true, capacity: 1 },
      { time: '12:00', available: false, capacity: 0 },
      { time: '13:00', available: false, capacity: 0 },
      { time: '14:00', available: true, capacity: 1 },
      { time: '15:00', available: true, capacity: 1 },
    ],
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
]

// ============================================
// AGGREGATED MOCK DATA RESPONSE
// ============================================

export interface MockBookingDataResponse {
  settings: BookingPageSettings
  addons: ServiceAddon[]
  customFields: CustomBookingField[]
  blackoutDates: BlackoutDate[]
  timeSlotOverrides: TimeSlotOverride[]
}

export const getMockBookingData = (): MockBookingDataResponse => ({
  settings: mockBookingPageSettings,
  addons: mockServiceAddons,
  customFields: mockCustomBookingFields,
  blackoutDates: mockBlackoutDates,
  timeSlotOverrides: mockTimeSlotOverrides,
})

// ============================================
// HELPER FUNCTION TO GET ACTIVE ITEMS
// ============================================

export const getActiveMockAddons = (): ServiceAddon[] =>
  mockServiceAddons.filter((addon) => addon.isActive)

export const getActiveMockCustomFields = (): CustomBookingField[] =>
  mockCustomBookingFields.filter((field) => field.isActive)

export const getPopularMockAddons = (): ServiceAddon[] =>
  mockServiceAddons.filter((addon) => addon.isActive && addon.isPopular)

// ============================================
// SAMPLE TIME SLOTS FOR A REGULAR DAY
// ============================================

export const getDefaultTimeSlots = () => [
  { time: '08:00', available: true, capacity: 2 },
  { time: '09:00', available: true, capacity: 2 },
  { time: '10:00', available: true, capacity: 2 },
  { time: '11:00', available: true, capacity: 2 },
  { time: '12:00', available: true, capacity: 1 },
  { time: '13:00', available: true, capacity: 2 },
  { time: '14:00', available: true, capacity: 2 },
  { time: '15:00', available: true, capacity: 2 },
  { time: '16:00', available: true, capacity: 2 },
  { time: '17:00', available: true, capacity: 1 },
]
