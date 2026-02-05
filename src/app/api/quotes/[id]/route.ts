// @ts-nocheck
/**
 * Individual Quote API Routes
 * GET - Get single quote
 * PATCH - Update quote
 * DELETE - Delete quote
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Get single quote
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: quote, error } = await supabase
      .from("quotes")
      .select(
        `
        *,
        leads(id, name, phone, email),
        quote_line_items(*),
        quote_follow_ups(*)
      `
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (error || !quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    }

    return NextResponse.json({ quote })
  } catch (error) {
    console.error("GET quote error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH - Update quote
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    // Verify ownership
    const { data: existing } = await supabase
      .from("quotes")
      .select("id, status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    }

    // Don&apos;t allow editing sent/accepted quotes (only certain fields)
    const allowedFields = ["internal_notes", "follow_up_enabled", "follow_up_paused"]
    if (existing.status !== "draft") {
      const updateData: Record<string, unknown> = {}
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updateData[field] = body[field]
        }
      }
      
      const { data: quote, error } = await supabase
        .from("quotes")
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ quote })
    }

    // For draft quotes, allow full updates
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    const editableFields = [
      "title",
      "address_line1",
      "city",
      "state",
      "zip",
      "sqft",
      "bedrooms",
      "bathrooms",
      "property_type",
      "property_condition",
      "has_pets",
      "pet_details",
      "pricing_method",
      "base_price",
      "adjustments",
      "subtotal",
      "discount_amount",
      "discount_reason",
      "total",
      "estimated_hours",
      "labor_cost",
      "supply_cost",
      "travel_cost",
      "total_cost",
      "profit_amount",
      "profit_margin",
      "internal_notes",
      "follow_up_enabled",
    ]

    for (const field of editableFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const { data: quote, error } = await supabase
      .from("quotes")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ quote })
  } catch (error) {
    console.error("PATCH quote error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Delete quote
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from("quotes")
      .select("id, status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    }

    // Only allow deleting draft quotes
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Cannot delete sent quotes. You can cancel follow-ups instead." },
        { status: 400 }
      )
    }

    // Delete line items first
    await supabase.from("quote_line_items").delete().eq("quote_id", id)

    // Delete follow-ups
    await supabase.from("quote_follow_ups").delete().eq("quote_id", id)

    // Delete quote
    const { error } = await supabase.from("quotes").delete().eq("id", id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE quote error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
