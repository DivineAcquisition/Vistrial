export interface TemplateVariable {
  key: string
  label: string
  description: string
  example: string
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  {
    key: "{{first_name}}",
    label: "First Name",
    description: "Customer's first name",
    example: "John",
  },
  {
    key: "{{name}}",
    label: "Full Name",
    description: "Customer's full name",
    example: "John Smith",
  },
  {
    key: "{{quote_amount}}",
    label: "Quote Amount",
    description: "The quoted price with dollar sign",
    example: "$850",
  },
  {
    key: "{{business_name}}",
    label: "Business Name",
    description: "Your business name",
    example: "Pro Plumbing",
  },
  {
    key: "{{business_phone}}",
    label: "Business Phone",
    description: "Your business phone number",
    example: "(555) 123-4567",
  },
]

export function processTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template

  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value)
  }

  return result
}

export function getTemplateVariables(
  lead: { name: string; quote_amount?: number | null },
  profile: { business_name?: string | null; business_phone?: string | null }
): Record<string, string> {
  const firstName = lead.name.split(" ")[0]
  const quoteAmount = lead.quote_amount ? `$${lead.quote_amount}` : "your quote"

  return {
    "{{first_name}}": firstName,
    "{{name}}": lead.name,
    "{{quote_amount}}": quoteAmount,
    "{{business_name}}": profile.business_name || "us",
    "{{business_phone}}": profile.business_phone || "",
  }
}
