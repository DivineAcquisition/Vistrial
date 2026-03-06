// ============================================
// BOOKING PAGE TYPE DEFINITIONS
// ============================================

export interface PricingVariable {
  id: string;
  name: string;
  type: 'select' | 'number' | 'checkbox' | 'radio';
  required: boolean;
  options?: PricingOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export interface PricingOption {
  id: string;
  label: string;
  value: string;
  priceModifier: PriceModifier;
}

export interface PriceModifier {
  type: 'fixed' | 'percentage' | 'multiply' | 'add';
  value: number;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  basePrice: number;
  priceType: 'fixed' | 'starting_at' | 'range' | 'quote';
  maxPrice?: number;
  duration?: number;
  variables: PricingVariable[];
  addOns: AddOn[];
  active: boolean;
}

export interface AddOn {
  id: string;
  name: string;
  description?: string;
  price: number;
  priceType: 'fixed' | 'percentage';
}

export interface PricingMatrix {
  id: string;
  organizationId: string;
  name: string;
  businessType: string;
  services: Service[];
  globalVariables: PricingVariable[];
  createdAt: string;
  updatedAt: string;
  sourceDocument?: {
    type: 'pdf' | 'image' | 'docx';
    url: string;
    extractedAt: string;
  };
}

export interface BookingPage {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  pricingMatrixId: string;
  settings: BookingPageSettings;
  customization: BookingPageCustomization;
  active: boolean;
  createdAt: string;
}

export interface BookingPageSettings {
  requirePhone: boolean;
  requireEmail: boolean;
  requireAddress: boolean;
  showPricing: boolean;
  showEstimate: boolean;
  allowDateSelection: boolean;
  allowTimeSelection: boolean;
  leadTime: number;
  maxAdvance: number;
  availableDays: string[];
  availableHours: { start: string; end: string };
  confirmationMessage: string;
  notificationEmail: string;
  notificationSms: boolean;
}

export interface BookingPageCustomization {
  logo?: string;
  primaryColor: string;
  headline: string;
  subheadline?: string;
  ctaText: string;
  thankYouMessage: string;
}

export interface BookingRequest {
  id: string;
  organizationId: string;
  bookingPageId: string;
  contactId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  customerAddress?: string;
  serviceId: string;
  serviceName: string;
  selectedOptions: Record<string, string | number | boolean>;
  selectedAddOns: string[];
  estimatedPrice: number;
  priceType: 'fixed' | 'estimate' | 'quote';
  preferredDate?: string;
  preferredTime?: string;
  flexibility?: 'exact' | 'flexible' | 'anytime';
  customerNotes?: string;
  source: 'direct' | 'embed' | 'campaign';
  campaignId?: string;
  workflowId?: string;
  utmParams?: Record<string, string>;
  status: 'new' | 'contacted' | 'quoted' | 'booked' | 'completed' | 'cancelled';
  finalPrice?: number;
  createdAt: string;
  updatedAt: string;
}
