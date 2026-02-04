/**
 * Single Workflow API
 * 
 * Endpoints for managing a specific workflow:
 * - GET: Fetch workflow details including steps and stats
 * - PUT: Update workflow configuration
 * - DELETE: Delete a workflow
 * - PATCH: Partial update (e.g., activate/pause)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
// import { workflowsService } from "@/services/workflows.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Implement with workflows.service.ts
    // const workflow = await workflowsService.getById(id, user.id);
    // if (!workflow) {
    //   return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    // }

    return NextResponse.json({ workflow: { id } });
  } catch (error) {
    console.error("Workflow GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch workflow" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // TODO: Validate and update workflow
    // const workflow = await workflowsService.update(id, user.id, body);

    return NextResponse.json({ success: true, workflow: { id } });
  } catch (error) {
    console.error("Workflow PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update workflow" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    // Handle specific actions
    switch (action) {
      case "activate":
        // TODO: Activate workflow
        // await workflowsService.activate(id, user.id);
        break;
      case "pause":
        // TODO: Pause workflow
        // await workflowsService.pause(id, user.id);
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Workflow PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update workflow" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Delete workflow
    // await workflowsService.delete(id, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Workflow DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete workflow" },
      { status: 500 }
    );
  }
}
