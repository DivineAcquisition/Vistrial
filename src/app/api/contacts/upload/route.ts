/**
 * Contact Upload API
 * 
 * Handles bulk contact imports from CSV/Excel files:
 * - POST: Process uploaded file and import contacts
 * 
 * Request body (JSON):
 * - contacts: Array of contact objects with mapped fields
 * - mappings: Column to field mappings
 * - options: Import options (skip_duplicates, update_existing)
 * 
 * Returns:
 * - imported: Number of successfully imported contacts
 * - skipped: Number of skipped duplicates
 * - errors: Array of row errors with details
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
// import { contactsService } from "@/services/contacts.service";

interface ImportContact {
  first_name: string;
  last_name?: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}

interface ImportOptions {
  skip_duplicates?: boolean;
  update_existing?: boolean;
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
    const { contacts, options } = body as {
      contacts: ImportContact[];
      options?: ImportOptions;
    };

    if (!contacts || !Array.isArray(contacts)) {
      return NextResponse.json(
        { error: "Invalid contacts data" },
        { status: 400 }
      );
    }

    // TODO: Validate phone numbers
    // TODO: Normalize phone numbers to E.164 format
    // TODO: Check for duplicates based on phone number
    // TODO: Implement batch insert with contacts.service.ts

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as Array<{ row: number; error: string }>,
    };

    // Process contacts
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      
      // Validate required fields
      if (!contact.first_name || !contact.phone) {
        results.errors.push({
          row: i + 1,
          error: "Missing required field (first_name or phone)",
        });
        continue;
      }

      // TODO: Insert or update contact
      // try {
      //   await contactsService.upsert({
      //     businessId: user.id,
      //     ...contact,
      //   });
      //   results.imported++;
      // } catch (err) {
      //   results.errors.push({ row: i + 1, error: err.message });
      // }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Contact upload error:", error);
    return NextResponse.json(
      { error: "Failed to import contacts" },
      { status: 500 }
    );
  }
}
