/**
 * Quote Follow-ups Cron API Route
 * GET/POST - Process pending quote follow-ups
 *
 * This endpoint should be called by a cron job (e.g., Vercel Cron)
 * Configure in vercel.json:
 * {
 *   "crons": [
 *     { "path": "/api/cron/follow-ups", "schedule": "0 * * * *" }
 *   ]
 * }
 */

import { NextRequest, NextResponse } from "next/server"
import { processPendingFollowUps } from "@/lib/quotes/follow-ups"

const CRON_SECRET = process.env.CRON_SECRET

// Verify cron authorization
function verifyCronAuth(request: NextRequest): boolean {
  // In development, allow all requests
  if (process.env.NODE_ENV === "development") {
    return true
  }

  // Check for Vercel cron header
  const isVercelCron = request.headers.get("x-vercel-cron") === "true"
  if (isVercelCron) {
    return true
  }

  // Check for Bearer token
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization")
    if (authHeader === `Bearer ${CRON_SECRET}`) {
      return true
    }
  }

  return false
}

export async function GET(request: NextRequest) {
  // Verify authorization
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    console.log("Starting quote follow-up processing...")
    const startTime = Date.now()

    const result = await processPendingFollowUps()

    const duration = Date.now() - startTime

    console.log(`Follow-up processing complete in ${duration}ms:`, result)

    return NextResponse.json({
      success: true,
      ...result,
      duration,
    })
  } catch (error) {
    console.error("Cron follow-up error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process follow-ups",
      },
      { status: 500 }
    )
  }
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
  return GET(request)
}
