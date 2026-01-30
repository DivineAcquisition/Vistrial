import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  // Onboarding is only accessible via app.vistrial.io
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) {
    const isAppDomain = hostname.includes("app.vistrial.io") || 
                        hostname.includes("localhost") || 
                        hostname.includes("127.0.0.1");
    
    if (!isAppDomain) {
      // Redirect to app.vistrial.io/onboarding
      return NextResponse.redirect("https://app.vistrial.io/onboarding");
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
