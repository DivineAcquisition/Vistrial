/**
 * Next.js Middleware
 * 
 * Handles request processing before page/API routes:
 * - Session management and refresh
 * - Authentication checks
 * - Route protection
 * 
 * Note: This file should be at the project root (not in src/)
 */

import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Match all routes except:
    // - Static files (_next/static, _next/image, favicon.ico)
    // - Image files (svg, png, jpg, jpeg, gif, webp)
    // - API webhooks (need to skip auth for incoming webhooks)
    // - Public pages (book, embed, q routes)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/webhooks|book|embed|q).*)",
  ],
};
