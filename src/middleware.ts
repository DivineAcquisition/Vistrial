import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Domain Routing Configuration
 * 
 * Domains and their allowed paths:
 * - vistrial.io (main): Landing page only
 * - app.vistrial.io: Dashboard, auth, onboarding, settings
 * - embed.vistrial.io: Embed widget only
 * - book.vistrial.io: Public booking pages only
 */

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  // Skip static files and API routes for domain checks
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return await updateSession(request);
  }

  // Development mode - allow all routes
  const isDev = hostname.includes("localhost") || hostname.includes("127.0.0.1");
  if (isDev) {
    return await updateSession(request);
  }

  // ============================================
  // EMBED DOMAIN - embed.vistrial.io
  // Only serves /embed/[slug] routes
  // ============================================
  if (hostname.includes("embed.vistrial.io")) {
    // Allow embed routes
    if (pathname.startsWith("/embed/")) {
      return await updateSession(request);
    }
    
    // Redirect root to main site
    if (pathname === "/") {
      return NextResponse.redirect("https://vistrial.io");
    }
    
    // Block all other routes - return 404 or redirect to main
    return NextResponse.redirect("https://vistrial.io");
  }

  // ============================================
  // BOOK DOMAIN - book.vistrial.io
  // Only serves /book/[slug] routes (public booking pages)
  // ============================================
  if (hostname.includes("book.vistrial.io")) {
    // Allow booking routes
    if (pathname.startsWith("/book/")) {
      return await updateSession(request);
    }
    
    // Redirect root to main site
    if (pathname === "/") {
      return NextResponse.redirect("https://vistrial.io");
    }
    
    // Block all other routes
    return NextResponse.redirect("https://vistrial.io");
  }

  // ============================================
  // QUOTES DOMAIN - quotes.vistrial.io (public quote viewing)
  // Only serves /q/[token] routes
  // ============================================
  if (hostname.includes("quotes.vistrial.io")) {
    // Allow quote viewing routes
    if (pathname.startsWith("/q/")) {
      return await updateSession(request);
    }
    
    // Redirect root to main site
    if (pathname === "/") {
      return NextResponse.redirect("https://vistrial.io");
    }
    
    // Block all other routes
    return NextResponse.redirect("https://vistrial.io");
  }

  // ============================================
  // APP DOMAIN - app.vistrial.io
  // Dashboard, auth, settings, onboarding
  // ============================================
  if (hostname.includes("app.vistrial.io")) {
    const allowedPaths = [
      "/dashboard",
      "/bookings",
      "/customers",
      "/quotes",
      "/sequences",
      "/settings",
      "/onboarding",
      "/login",
      "/signup",
      "/forgot-password",
      "/auth",
    ];
    
    // Check if path is allowed
    const isAllowed = allowedPaths.some(
      (path) => pathname === path || pathname.startsWith(path + "/")
    );
    
    if (isAllowed) {
      return await updateSession(request);
    }
    
    // Redirect root to dashboard
    if (pathname === "/") {
      return NextResponse.redirect("https://app.vistrial.io/dashboard");
    }
    
    // Unknown paths redirect to dashboard
    return NextResponse.redirect("https://app.vistrial.io/dashboard");
  }

  // ============================================
  // MAIN DOMAIN - vistrial.io
  // Landing page, public pages
  // ============================================
  if (hostname.includes("vistrial.io") && !hostname.includes("app.") && !hostname.includes("embed.") && !hostname.includes("book.") && !hostname.includes("quotes.")) {
    // Landing page
    if (pathname === "/") {
      return await updateSession(request);
    }
    
    // Auth pages redirect to app domain
    if (pathname === "/login" || pathname === "/signup" || pathname.startsWith("/auth")) {
      const redirectUrl = new URL(pathname, "https://app.vistrial.io");
      redirectUrl.search = request.nextUrl.search;
      return NextResponse.redirect(redirectUrl);
    }
    
    // Dashboard/app routes redirect to app domain
    if (
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/bookings") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/onboarding") ||
      pathname.startsWith("/quotes") && !pathname.startsWith("/q/")
    ) {
      const redirectUrl = new URL(pathname, "https://app.vistrial.io");
      redirectUrl.search = request.nextUrl.search;
      return NextResponse.redirect(redirectUrl);
    }
    
    // Public booking pages redirect to book domain
    if (pathname.startsWith("/book/")) {
      const redirectUrl = new URL(pathname, "https://book.vistrial.io");
      return NextResponse.redirect(redirectUrl);
    }
    
    // Embed routes redirect to embed domain
    if (pathname.startsWith("/embed/")) {
      const redirectUrl = new URL(pathname, "https://embed.vistrial.io");
      return NextResponse.redirect(redirectUrl);
    }
    
    // Public quote viewing stays accessible from main domain too
    if (pathname.startsWith("/q/")) {
      return await updateSession(request);
    }
    
    // Other public pages (terms, privacy, etc.) - allow
    return await updateSession(request);
  }

  // Default: continue with session update
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
