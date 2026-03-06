// @ts-nocheck
// ============================================
// AI PRICING EXTRACTION
// Extract pricing matrix from uploaded documents
// ============================================

import type { PricingMatrix } from '@/types/booking';

interface ExtractionResult {
  success: boolean;
  pricingMatrix?: Partial<PricingMatrix>;
  rawExtraction?: any;
  error?: string;
}

const EXTRACTION_PROMPT = `You are an expert at analyzing pricing documents for home service businesses (cleaning, HVAC, plumbing, landscaping, etc.).

Analyze the provided pricing document and extract a complete pricing matrix in JSON format.

Extract:
1. **Services**: Each distinct service offered with base prices
2. **Variables**: Factors that affect pricing (bedrooms, square footage, frequency, etc.)
3. **Options**: Specific choices for each variable with price modifiers
4. **Add-ons**: Optional extras with their prices

For price modifiers, determine:
- "fixed": A specific dollar amount (e.g., "$150 for 2BR")
- "add": Add this amount to base (e.g., "+$25 for each additional room")
- "percentage": Percentage adjustment (e.g., "-15% for weekly service")
- "multiply": Multiply base by this factor (e.g., "1.5x for deep clean")

Return ONLY valid JSON in this exact structure:
{
  "businessType": "string",
  "services": [
    {
      "id": "unique_id",
      "name": "Service Name",
      "description": "Brief description",
      "basePrice": 100,
      "priceType": "fixed|starting_at|range|quote",
      "maxPrice": null,
      "duration": 120,
      "variables": [
        {
          "id": "unique_id",
          "name": "Variable Name",
          "type": "select|number|checkbox|radio",
          "required": true,
          "options": [
            {
              "id": "unique_id",
              "label": "Option Label",
              "value": "option_value",
              "priceModifier": { "type": "fixed|percentage|multiply|add", "value": 100 }
            }
          ]
        }
      ],
      "addOns": [
        { "id": "unique_id", "name": "Add-on Name", "description": "Description", "price": 25, "priceType": "fixed|percentage" }
      ],
      "active": true
    }
  ],
  "globalVariables": []
}

IMPORTANT: Generate unique IDs using format: svc_1, var_1, opt_1, addon_1. If pricing is unclear, use "quote" as priceType. Be thorough - capture every pricing detail.`;

export async function extractPricingFromDocument(
  documentContent: string,
  documentType: 'pdf' | 'image' | 'text',
  mimeType?: string
): Promise<ExtractionResult> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'ANTHROPIC_API_KEY not configured' };
    }

    // Dynamic import to avoid build issues if SDK not installed
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey });

    let messageContent: any;

    if (documentType === 'image') {
      messageContent = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: (mimeType || 'image/png'),
            data: documentContent,
          },
        },
        { type: 'text', text: 'Extract the complete pricing information from this image.' },
      ];
    } else {
      messageContent = [
        { type: 'text', text: `Extract the complete pricing information from this document:\n\n${documentContent}` },
      ];
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: messageContent }],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const extracted = JSON.parse(jsonStr.trim());

    return {
      success: true,
      pricingMatrix: {
        businessType: extracted.businessType,
        services: extracted.services,
        globalVariables: extracted.globalVariables || [],
      },
      rawExtraction: extracted,
    };
  } catch (error) {
    console.error('Pricing extraction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract pricing',
    };
  }
}

export async function extractPricingFromImage(base64Image: string, mimeType: string): Promise<ExtractionResult> {
  return extractPricingFromDocument(base64Image, 'image', mimeType);
}

export async function extractPricingFromText(textContent: string): Promise<ExtractionResult> {
  return extractPricingFromDocument(textContent, 'text');
}
