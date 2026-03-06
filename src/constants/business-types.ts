/**
 * Business Types Configuration
 *
 * IDs MUST match the public.business_type enum in the database:
 * cleaning_residential, cleaning_commercial, hvac, plumbing, electrical,
 * landscaping, pest_control, roofing, painting, handyman, moving,
 * carpet_cleaning, window_cleaning, pressure_washing, pool_service,
 * garage_door, appliance_repair, locksmith, junk_removal, other
 */

export interface BusinessType {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultServices: string[];
  suggestedWorkflows: string[];
}

export const BUSINESS_TYPES: BusinessType[] = [
  {
    id: "cleaning_residential",
    name: "Residential Cleaning",
    description: "Residential cleaning companies",
    icon: "Sparkles",
    defaultServices: [
      "Deep Cleaning",
      "Regular Cleaning",
      "Move-in/Move-out Cleaning",
      "Post-Construction Cleaning",
    ],
    suggestedWorkflows: ["reactivation-sms-basic", "seasonal-reminder"],
  },
  {
    id: "cleaning_commercial",
    name: "Commercial Cleaning",
    description: "Commercial and office cleaning companies",
    icon: "Sparkles",
    defaultServices: [
      "Office Cleaning",
      "Floor Stripping & Waxing",
      "Janitorial Services",
      "Post-Construction Cleanup",
    ],
    suggestedWorkflows: ["reactivation-sms-basic", "seasonal-reminder"],
  },
  {
    id: "landscaping",
    name: "Landscaping",
    description: "Lawn care and landscaping services",
    icon: "TreeDeciduous",
    defaultServices: [
      "Lawn Mowing",
      "Garden Maintenance",
      "Tree Trimming",
      "Landscape Design",
      "Irrigation",
    ],
    suggestedWorkflows: ["reactivation-sms-basic", "seasonal-reminder"],
  },
  {
    id: "plumbing",
    name: "Plumbing",
    description: "Plumbing repair and installation",
    icon: "Droplet",
    defaultServices: [
      "Leak Repair",
      "Drain Cleaning",
      "Water Heater Installation",
      "Pipe Replacement",
      "Emergency Plumbing",
    ],
    suggestedWorkflows: ["reactivation-voice", "maintenance-reminder"],
  },
  {
    id: "hvac",
    name: "HVAC",
    description: "Heating, ventilation, and air conditioning",
    icon: "Thermometer",
    defaultServices: [
      "AC Repair",
      "Heating Repair",
      "System Installation",
      "Maintenance",
      "Duct Cleaning",
    ],
    suggestedWorkflows: ["seasonal-reminder", "maintenance-reminder"],
  },
  {
    id: "electrical",
    name: "Electrical",
    description: "Electrical services and repairs",
    icon: "Zap",
    defaultServices: [
      "Wiring",
      "Panel Upgrades",
      "Outlet Installation",
      "Lighting",
      "Emergency Electrical",
    ],
    suggestedWorkflows: ["reactivation-voice", "safety-checkup"],
  },
  {
    id: "roofing",
    name: "Roofing",
    description: "Roof repair and installation",
    icon: "Home",
    defaultServices: [
      "Roof Repair",
      "Roof Replacement",
      "Inspection",
      "Gutter Installation",
      "Storm Damage Repair",
    ],
    suggestedWorkflows: ["reactivation-sms-basic", "storm-followup"],
  },
  {
    id: "painting",
    name: "Painting",
    description: "Interior and exterior painting",
    icon: "Paintbrush",
    defaultServices: [
      "Interior Painting",
      "Exterior Painting",
      "Cabinet Refinishing",
      "Staining",
      "Wallpaper",
    ],
    suggestedWorkflows: ["reactivation-sms-basic", "seasonal-refresh"],
  },
  {
    id: "pest_control",
    name: "Pest Control",
    description: "Pest elimination and prevention",
    icon: "Bug",
    defaultServices: [
      "General Pest Control",
      "Termite Treatment",
      "Rodent Control",
      "Mosquito Treatment",
      "Wildlife Removal",
    ],
    suggestedWorkflows: ["subscription-renewal", "seasonal-prevention"],
  },
  {
    id: "handyman",
    name: "Handyman",
    description: "General handyman and repair services",
    icon: "Hammer",
    defaultServices: [
      "General Repairs",
      "Furniture Assembly",
      "Drywall Repair",
      "Deck Building",
      "Minor Remodeling",
    ],
    suggestedWorkflows: ["reactivation-voice", "project-followup"],
  },
  {
    id: "pool_service",
    name: "Pool Service",
    description: "Pool cleaning and maintenance",
    icon: "Waves",
    defaultServices: [
      "Weekly Cleaning",
      "Equipment Repair",
      "Opening/Closing",
      "Renovation",
      "Chemical Balancing",
    ],
    suggestedWorkflows: ["seasonal-reminder", "subscription-renewal"],
  },
  {
    id: "carpet_cleaning",
    name: "Carpet Cleaning",
    description: "Carpet and upholstery cleaning",
    icon: "Sparkles",
    defaultServices: [
      "Carpet Cleaning",
      "Upholstery Cleaning",
      "Stain Removal",
      "Area Rug Cleaning",
    ],
    suggestedWorkflows: ["reactivation-sms-basic", "seasonal-reminder"],
  },
  {
    id: "pressure_washing",
    name: "Pressure Washing",
    description: "Exterior pressure washing services",
    icon: "Droplet",
    defaultServices: [
      "House Washing",
      "Driveway Cleaning",
      "Deck Cleaning",
      "Fence Cleaning",
    ],
    suggestedWorkflows: ["reactivation-sms-basic", "seasonal-reminder"],
  },
  {
    id: "window_cleaning",
    name: "Window Cleaning",
    description: "Window cleaning services",
    icon: "Sparkles",
    defaultServices: [
      "Interior Windows",
      "Exterior Windows",
      "Screen Cleaning",
      "Gutter Cleaning",
    ],
    suggestedWorkflows: ["reactivation-sms-basic", "seasonal-reminder"],
  },
  {
    id: "junk_removal",
    name: "Junk Removal",
    description: "Junk and debris removal",
    icon: "Trash",
    defaultServices: [
      "Residential Junk Removal",
      "Commercial Cleanout",
      "Construction Debris",
      "Estate Cleanout",
    ],
    suggestedWorkflows: ["reactivation-sms-basic"],
  },
  {
    id: "other",
    name: "Other",
    description: "Other home service business",
    icon: "Wrench",
    defaultServices: [],
    suggestedWorkflows: ["reactivation-sms-basic"],
  },
];

export function getBusinessTypeById(id: string): BusinessType | undefined {
  return BUSINESS_TYPES.find((type) => type.id === id);
}

export function getBusinessTypeByName(name: string): BusinessType | undefined {
  return BUSINESS_TYPES.find(
    (type) => type.name.toLowerCase() === name.toLowerCase()
  );
}
