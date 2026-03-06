// @ts-nocheck
// ============================================
// ONBOARDING STEP API
// Handles all onboarding step submissions
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { seedOrganizationDefaults } from '@/lib/services/org-defaults.service';
import { createBrand } from '@/lib/telnyx/a2p-service';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { step, data } = body;
    const admin = getSupabaseAdminClient();
    const orgId = context.organization.id;

    switch (step) {
      // ========================================
      // STEP 0: Business Profile
      // ========================================
      case 'business_profile': {
        const { business_name, phone, email, service_areas, timezone, monthly_cleans, job_tracking_tools } = data;

        const existingSettings = (context.organization.settings as Record<string, any>) || {};
        await admin.from('organizations').update({
          name: business_name || context.organization.name,
          phone: phone || context.organization.phone,
          email: email,
          timezone: timezone || 'America/New_York',
          settings: {
            ...existingSettings,
            service_areas: service_areas || [],
            monthly_cleans: monthly_cleans || '1-10',
            job_tracking_tools: job_tracking_tools || [],
            business_hours: existingSettings.business_hours || { start: '08:00', end: '18:00' },
          },
          onboarding_step: 1,
        }).eq('id', orgId);

        // Seed defaults if not already seeded
        const { count } = await admin.from('service_types').select('*', { count: 'exact', head: true }).eq('org_id', orgId);
        if (!count || count === 0) {
          await seedOrganizationDefaults(orgId);
        }

        return NextResponse.json({ success: true, step: 1 });
      }

      // ========================================
      // STEP 1: Services
      // ========================================
      case 'services': {
        const { services } = data;
        if (!services || !Array.isArray(services)) return NextResponse.json({ error: 'services array required' }, { status: 400 });

        for (const svc of services) {
          if (svc.id) {
            await admin.from('service_types').update({
              name: svc.name,
              min_price_cents: svc.min_price_cents,
              max_price_cents: svc.max_price_cents,
              avg_duration_minutes: svc.avg_duration_minutes,
              is_active: svc.is_active,
            }).eq('id', svc.id).eq('org_id', orgId);
          } else {
            const slug = svc.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            await admin.from('service_types').upsert({
              org_id: orgId,
              name: svc.name,
              slug,
              min_price_cents: svc.min_price_cents,
              max_price_cents: svc.max_price_cents,
              avg_duration_minutes: svc.avg_duration_minutes,
              is_active: svc.is_active ?? true,
            }, { onConflict: 'org_id,slug' });
          }
        }

        await admin.from('organizations').update({ onboarding_step: 2 }).eq('id', orgId);
        return NextResponse.json({ success: true, step: 2 });
      }

      // ========================================
      // STEP 2: Offers
      // ========================================
      case 'offers': {
        const { offers } = data;
        if (!offers || !Array.isArray(offers)) return NextResponse.json({ error: 'offers array required' }, { status: 400 });

        for (const offer of offers) {
          if (offer.id) {
            await admin.from('conversion_offers').update({
              name: offer.name,
              frequency: offer.frequency,
              price_per_visit_cents: offer.price_per_visit_cents,
              discount_percent: offer.discount_percent,
              discount_duration_months: offer.discount_duration_months,
              priority_scheduling: offer.priority_scheduling,
              bonus_description: offer.bonus_description,
              sms_preview: offer.sms_preview,
              is_active: offer.is_active,
            }).eq('id', offer.id).eq('org_id', orgId);
          }
        }

        await admin.from('organizations').update({ onboarding_step: 3 }).eq('id', orgId);
        return NextResponse.json({ success: true, step: 3 });
      }

      // ========================================
      // STEP 3: Job Source
      // ========================================
      case 'job_source': {
        const { job_sources } = data;
        const existingSettings = (context.organization.settings as Record<string, any>) || {};
        const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.vistrial.io'}/api/webhooks/jobs?org=${orgId}`;

        await admin.from('organizations').update({
          settings: {
            ...existingSettings,
            job_sources: job_sources || [],
            webhook_url: webhookUrl,
          },
          onboarding_step: 4,
        }).eq('id', orgId);

        return NextResponse.json({ success: true, step: 4, webhookUrl });
      }

      // ========================================
      // STEP 4: Messaging (A2P registration)
      // ========================================
      case 'messaging': {
        const { legal_business_name, ein, business_phone, business_email, street, city, state, postal_code, skip } = data;

        if (skip) {
          await admin.from('organizations').update({ onboarding_completed: true, onboarding_step: 5 }).eq('id', orgId);
          return NextResponse.json({ success: true, step: 5, skipped: true });
        }

        if (!legal_business_name || !ein || !business_phone || !business_email || !street || !city || !state || !postal_code) {
          return NextResponse.json({ error: 'All messaging fields required' }, { status: 400 });
        }

        // Submit to Telnyx
        try {
          const brandResult = await createBrand({
            displayName: legal_business_name, companyName: legal_business_name,
            ein, phone: business_phone, email: business_email,
            street, city, state, postalCode: postal_code,
          });

          await admin.from('messaging_registrations').upsert({
            org_id: orgId,
            legal_business_name, ein, business_phone, business_email,
            street, city, state, postal_code,
            telnyx_brand_id: brandResult.brandId,
            brand_status: 'pending',
            overall_status: 'pending_approval',
            brand_submitted_at: new Date().toISOString(),
          }, { onConflict: 'org_id' });
        } catch (err) {
          console.error('Telnyx brand registration failed:', err);
          // Don't block onboarding if Telnyx fails
        }

        await admin.from('organizations').update({ onboarding_completed: true, onboarding_step: 5 }).eq('id', orgId);
        return NextResponse.json({ success: true, step: 5 });
      }

      // ========================================
      // COMPLETE: Mark onboarding done
      // ========================================
      case 'complete': {
        await admin.from('organizations').update({ onboarding_completed: true, onboarding_step: 5 }).eq('id', orgId);
        return NextResponse.json({ success: true, completed: true });
      }

      default:
        return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
    }
  } catch (error) {
    console.error('Onboarding error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Onboarding failed' }, { status: 500 });
  }
}

// GET: fetch current onboarding data
export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = getSupabaseAdminClient();
    const orgId = context.organization.id;

    const [{ data: services }, { data: offers }, { data: messaging }] = await Promise.all([
      admin.from('service_types').select('*').eq('org_id', orgId).order('sort_order'),
      admin.from('conversion_offers').select('*').eq('org_id', orgId).order('sort_order'),
      admin.from('messaging_registrations').select('*').eq('org_id', orgId).maybeSingle(),
    ]);

    return NextResponse.json({
      organization: context.organization,
      services: services || [],
      offers: offers || [],
      messaging,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
