import { NextResponse, type NextRequest } from "next/server";

import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";
import { classifyProductHost } from "@/lib/marketing/hosts";

function pathWithSearch(request: NextRequest) {
  return request.nextUrl.pathname + request.nextUrl.search;
}

function continueWithPath(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-vistrial-pathname", pathWithSearch(request));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

/**
 * Host split for the restart. The public site stays on vistrial.io.
 * app.vistrial.io opens the workspace shell. admin.vistrial.io opens staff.
 * Sign-in is not wired yet, so these paths are not behind a session.
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const product = classifyProductHost(host);
  const productPath = path === "/app" || path.startsWith("/app/") || path === "/admin" || path.startsWith("/admin/");

  if ((product === "site" || product === "unknown") && productPath) {
    const dest = new URL(PRODUCTION_APP_ORIGIN);
    dest.pathname = path;
    dest.search = request.nextUrl.search;
    return NextResponse.redirect(dest);
  }

  if (product === "app" || product === "pulse") {
    if (path === "/") {
      const dest = request.nextUrl.clone();
      dest.pathname = "/app";
      return NextResponse.redirect(dest);
    }
  }

  if (product === "admin") {
    if (path === "/" || path === "/app" || path.startsWith("/app/")) {
      const dest = request.nextUrl.clone();
      dest.pathname = "/admin";
      dest.search = "";
      return NextResponse.redirect(dest);
    }
  }

  if (product === "stellar") {
    const dest = new URL(PRODUCTION_APP_ORIGIN);
    dest.pathname = "/app";
    return NextResponse.redirect(dest);
  }

  return continueWithPath(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2)$).*)",
  ],
};
