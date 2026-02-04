/**
 * Workflows API
 * 
 * Endpoints for managing workflows:
 * - GET: List all workflows for the authenticated user
 * - POST: Create a new workflow
 * 
 * Query params (GET):
 * - status: Filter by status (active, paused, draft)
 * - sort: Sort field (created_at, name, enrollments)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
// import { workflowsService } from "@/services/workflows.service";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";

    // TODO: Implement with workflows.service.ts
    // const workflows = await workflowsService.list({
    //   businessId: user.id,
    //   status,
    // });

    return NextResponse.json({ workflows: [] });
  } catch (error) {
    console.error("Workflows GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch workflows" },
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

    // TODO: Validate workflow schema with Zod
    // TODO: Implement with workflows.service.ts
    // const workflow = await workflowsService.create({
    //   businessId: user.id,
    //   name: body.name,
    //   steps: body.steps,
    //   settings: body.settings,
    // });

    return NextResponse.json({ success: true, workflow: null });
  } catch (error) {
    console.error("Workflows POST error:", error);
    return NextResponse.json(
      { error: "Failed to create workflow" },
      { status: 500 }
    );
  }
}
