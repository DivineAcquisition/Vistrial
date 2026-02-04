/**
 * Business Types Configuration
 * 
 * Predefined business types for home service companies
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
    id: "cleaning",
    name: "Cleaning Services",
    description: "Residential and commercial cleaning companies",
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
    id: "pest-control",
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
    id: "pool-service",
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
    id: "general-contractor",
    name: "General Contractor",
    description: "General construction and remodeling",
    icon: "Hammer",
    defaultServices: [
      "Kitchen Remodel",
      "Bathroom Remodel",
      "Room Addition",
      "Deck Building",
      "General Repairs",
    ],
    suggestedWorkflows: ["reactivation-voice", "project-followup"],
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
