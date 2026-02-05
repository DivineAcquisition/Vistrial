// @ts-nocheck
/**
 * Contacts API
 * 
 * Endpoints for managing contacts:
 * - GET: List contacts with pagination, search, and filters
 * - POST: Create a new contact
 * 
 * Query params (GET):
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 * - search: Search by name, phone, or email
 * - status: Filter by status (active, opted_out, unsubscribed)
 * - workflow_id: Filter by workflow enrollment
 * - sort: Sort field (created_at, name, last_contacted)
 * - order: Sort order (asc, desc)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
// import { contactsService } from "@/services/contacts.service";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";

    // TODO: Implement with contacts.service.ts
    // const contacts = await contactsService.list({
    //   businessId: user.id,
    //   page,
    //   limit,
    //   search,
    //   status,
    // });

    return NextResponse.json({
      contacts: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0,
      },
    });
  } catch (error) {
    console.error("Contacts GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // TODO: Validate with Zod schema
    // const validatedData = contactSchema.parse(body);

    // TODO: Implement with contacts.service.ts
    // const contact = await contactsService.create({
    //   businessId: user.id,
    //   ...validatedData,
    // });

    return NextResponse.json({ success: true, contact: null });
  } catch (error) {
    console.error("Contacts POST error:", error);
    return NextResponse.json(
      { error: "Failed to create contact" },
      { status: 500 }
    );
  }
}
