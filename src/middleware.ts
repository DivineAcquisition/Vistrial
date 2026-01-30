/**
 * Vistrial Subdomain Routing Middleware
 * 
 * Routes requests based on subdomain:
 * - access.vistrial.io  → Landing/marketing pages
 * - app.vistrial.io     → Business dashboard (authenticated)
 * - book.vistrial.io    → Public booking pages
 * - embed.vistrial.io   → Embeddable widget pages
 * - portal.vistrial.io  → Customer portal
 * - q.vistrial.io       → Quote view pages
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Subdomain configuration
type Subdomain = "access" | "app" | "book" | "embed" | "portal" | "q" | "localhost" | "unknown"

// Routes allowed for each subdomain
const SUBDOMAIN_ROUTES: Record<Subdomain, { allowed: string[]; redirect?: string }> = {
  // Landing/marketing site
  access: {
    allowed: ["/", "/login", "/signup", "/pricing", "/features", "/demo", "/privacy", "/terms"],
    redirect: "/",
  },
  // Business dashboard (authenticated)
  app: {
    allowed: [
      "/overview",
      "/details",
      "/quotes",
      "/sequences",
      "/settings",
      "/onboarding",
      "/api",
    ],
    redirect: "/overview",
  },
  // Public booking pages
  book: {
    allowed: ["/book"],
    redirect: undefined, // Requires slug
  },
  // Embeddable widget
  embed: {
    allowed: ["/embed"],
    redirect: undefined, // Requires slug
  },
  // Customer portal
  portal: {
    allowed: ["/portal"],
    redirect: undefined, // Requires slug
  },
  // Quote view pages
  q: {
    allowed: ["/q"],
    redirect: undefined, // Requires token
  },
  // Development - allow all
  localhost: {
    allowed: ["*"],
    redirect: "/",
  },
  // Unknown subdomain
  unknown: {
    allowed: [],
    redirect: undefined,
  },
}

// Dashboard routes that require authentication
const PROTECTED_ROUTES = [
  "/overview",
  "/details",
  "/quotes",
  "/sequences",
  "/settings",
]

// Extract subdomain from hostname
function getSubdomain(hostname: string): Subdomain {
  // Handle localhost
  if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
    return "localhost"
  }

  // Remove port if present
  const host = hostname.split(":")[0]

  // Split by dots
  const parts = host.split(".")

  // Check for vistrial.io domain
  if (parts.length >= 2) {
    const domain = parts.slice(-2).join(".")
    if (domain === "vistrial.io" || domain === "vistrial.com") {
      const subdomain = parts.length > 2 ? parts[0] : "access"
      if (subdomain in SUBDOMAIN_ROUTES) {
        return subdomain as Subdomain
      }
    }
  }

  // Handle Vercel preview URLs (*.vercel.app)
  if (host.includes("vercel.app")) {
    return "localhost" // Allow all routes in preview
  }

  // For any other domain (custom domains, etc.), allow all routes like localhost
  return "localhost"
}

// Check if path is allowed for subdomain
function isPathAllowed(subdomain: Subdomain, pathname: string): boolean {
  const config = SUBDOMAIN_ROUTES[subdomain]
  
  // Localhost allows everything
  if (config.allowed.includes("*")) {
    return true
  }

  // Check if path starts with any allowed prefix
  return config.allowed.some(allowed => {
    if (allowed === pathname) return true
    if (pathname.startsWith(allowed + "/")) return true
    if (allowed === "/api" && pathname.startsWith("/api")) return true
    return false
  })
}

// Rewrite URL for subdomain routing
function getRewriteUrl(subdomain: Subdomain, pathname: string, _request: NextRequest): string | null {
  // book.vistrial.io/company-slug → /book/company-slug
  if (subdomain === "book" && !pathname.startsWith("/book")) {
    if (pathname === "/" || pathname === "") {
      return null // No slug provided
    }
    return `/book${pathname}`
  }

  // embed.vistrial.io/company-slug → /embed/company-slug
  if (subdomain === "embed" && !pathname.startsWith("/embed")) {
    if (pathname === "/" || pathname === "") {
      return null // No slug provided
    }
    return `/embed${pathname}`
  }

  // q.vistrial.io/token → /q/token
  if (subdomain === "q" && !pathname.startsWith("/q")) {
    if (pathname === "/" || pathname === "") {
      return null // No token provided
    }
    return `/q${pathname}`
  }

  // portal.vistrial.io/company-slug → /portal/company-slug
  if (subdomain === "portal" && !pathname.startsWith("/portal")) {
    if (pathname === "/" || pathname === "") {
      return null // No slug provided
    }
    return `/portal${pathname}`
  }

  return null
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || ""
  const pathname = request.nextUrl.pathname
  const subdomain = getSubdomain(hostname)

  // Skip middleware for static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".") // Static files
  ) {
    return NextResponse.next()
  }

  // Handle API routes - allow all subdomains to access API
  if (pathname.startsWith("/api")) {
    return handleAuth(request)
  }

  // Check if URL needs rewriting for subdomain
  const rewriteUrl = getRewriteUrl(subdomain, pathname, request)
  if (rewriteUrl) {
    const url = request.nextUrl.clone()
    url.pathname = rewriteUrl
    return NextResponse.rewrite(url)
  }

  // Check if path is allowed for this subdomain
  if (!isPathAllowed(subdomain, pathname)) {
    const config = SUBDOMAIN_ROUTES[subdomain]
    
    // If subdomain has a redirect, use it
    if (config.redirect) {
      const url = request.nextUrl.clone()
      url.pathname = config.redirect
      return NextResponse.redirect(url)
    }

    // Otherwise show 404
    return NextResponse.rewrite(new URL("/not-found", request.url))
  }

  // Handle authentication for protected routes
  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    return handleAuth(request)
  }

  return NextResponse.next()
}

// Handle authentication
async function handleAuth(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({
              name,
              value,
              ...options,
            })
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({
              name,
              value,
              ...options,
            })
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({
              name,
              value: "",
              ...options,
            })
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({
              name,
              value: "",
              ...options,
            })
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    const pathname = request.nextUrl.pathname

    // Redirect to login if not authenticated and trying to access protected routes
    if (!user && PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
      return NextResponse.redirect(new URL("/login", request.url))
    }

    // Redirect to dashboard if authenticated and trying to access auth pages
    if (user && (pathname === "/login" || pathname === "/signup")) {
      return NextResponse.redirect(new URL("/overview", request.url))
    }

    return response
  } catch (error) {
    // If Supabase is not configured, allow the request
    return response
  }
}

// Configure which routes use middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
