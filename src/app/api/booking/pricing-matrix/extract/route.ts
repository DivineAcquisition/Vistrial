// @ts-nocheck
// ============================================
// EXTRACT PRICING MATRIX API
// Upload document and extract pricing via AI
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { extractPricingFromImage, extractPricingFromText } from '@/lib/ai/extract-pricing';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = (formData.get('name') as string) || 'My Pricing';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type;
    let extractionResult;

    if (mimeType.startsWith('image/')) {
      const base64 = fileBuffer.toString('base64');
      extractionResult = await extractPricingFromImage(base64, mimeType);
    } else if (mimeType === 'application/pdf') {
      // Dynamic import pdf-parse
      try {
        const pdf = (await import('pdf-parse')).default;
        const pdfData = await pdf(fileBuffer);
        extractionResult = await extractPricingFromText(pdfData.text);
      } catch {
        return NextResponse.json({ error: 'Failed to parse PDF. Try uploading an image instead.' }, { status: 400 });
      }
    } else if (mimeType === 'text/plain' || mimeType === 'text/csv') {
      const text = fileBuffer.toString('utf-8');
      extractionResult = await extractPricingFromText(text);
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload an image, PDF, or text file.' },
        { status: 400 }
      );
    }

    if (!extractionResult.success || !extractionResult.pricingMatrix) {
      return NextResponse.json(
        { error: extractionResult.error || 'Failed to extract pricing' },
        { status: 500 }
      );
    }

    const admin = getSupabaseAdminClient();
    const { data: pricingMatrix, error: dbError } = await admin
      .from('pricing_matrices')
      .insert({
        organization_id: context.organization.id,
        name,
        business_type: extractionResult.pricingMatrix.businessType,
        services: extractionResult.pricingMatrix.services,
        global_variables: extractionResult.pricingMatrix.globalVariables,
        source_document: {
          type: mimeType.startsWith('image/') ? 'image' : 'pdf',
          filename: file.name,
          extractedAt: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return NextResponse.json({
      success: true,
      pricingMatrix: {
        id: pricingMatrix.id,
        name: pricingMatrix.name,
        businessType: pricingMatrix.business_type,
        services: pricingMatrix.services,
        globalVariables: pricingMatrix.global_variables,
      },
    });
  } catch (error) {
    console.error('Extract pricing error:', error);
    return NextResponse.json({ error: 'Failed to extract pricing' }, { status: 500 });
  }
}
