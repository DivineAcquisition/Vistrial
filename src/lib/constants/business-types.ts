// ============================================
// BUSINESS TYPE CONSTANTS
// ============================================

export const BUSINESS_TYPES = [
  { value: 'cleaning', label: 'Cleaning Service', icon: '🧹' },
  { value: 'hvac', label: 'HVAC', icon: '❄️' },
  { value: 'plumbing', label: 'Plumbing', icon: '🔧' },
  { value: 'electrical', label: 'Electrical', icon: '⚡' },
  { value: 'landscaping', label: 'Landscaping', icon: '🌳' },
  { value: 'roofing', label: 'Roofing', icon: '🏠' },
  { value: 'painting', label: 'Painting', icon: '🎨' },
  { value: 'pest_control', label: 'Pest Control', icon: '🐜' },
  { value: 'general_contractor', label: 'General Contractor', icon: '🔨' },
  { value: 'moving', label: 'Moving Service', icon: '📦' },
  { value: 'carpet_cleaning', label: 'Carpet Cleaning', icon: '🧽' },
  { value: 'window_cleaning', label: 'Window Cleaning', icon: '🪟' },
  { value: 'pressure_washing', label: 'Pressure Washing', icon: '💦' },
  { value: 'pool_service', label: 'Pool Service', icon: '🏊' },
  { value: 'appliance_repair', label: 'Appliance Repair', icon: '🔌' },
  { value: 'locksmith', label: 'Locksmith', icon: '🔐' },
  { value: 'garage_door', label: 'Garage Door Service', icon: '🚗' },
  { value: 'handyman', label: 'Handyman', icon: '🛠️' },
  { value: 'flooring', label: 'Flooring', icon: '🪵' },
  { value: 'other', label: 'Other Home Service', icon: '🏡' },
] as const;

export type BusinessType = typeof BUSINESS_TYPES[number]['value'];

export function getBusinessTypeLabel(value: string): string {
  const type = BUSINESS_TYPES.find((t) => t.value === value);
  return type?.label || value;
}
