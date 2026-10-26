import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { isAuthPath, isProtectedAppPath, safeAppPath } from "@/lib/auth/redirect";
import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";
import { classifyProductHost, isClerkHost } from "@/lib/marketing/hosts";

function pathWithSearch(request: NextRequest) {
  return request.nextUrl.pathname + request.nextUrl.search;
}

function continueWithPath(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-vistrial-pathname", pathWithSearch(request));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

function hostProxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const product = classifyProductHost(host);
  const productPath = isProtectedAppPath(path);

  if ((product === "site" || product === "unknown") && (productPath || isAuthPath(path))) {
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

function redirectToSignIn(request: NextRequest, returnPath: string) {
  const dest = request.nextUrl.clone();
  dest.pathname = "/sign-in";
  dest.search = "";
  dest.searchParams.set("redirect_url", returnPath);
  return NextResponse.redirect(dest);
}

const withClerk = clerkMiddleware(async (auth, request) => {
  const routed = hostProxy(request);
  const path = request.nextUrl.pathname;
  const product = classifyProductHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));

  if (routed.headers.get("location")) {
    if ((product === "app" || product === "pulse") && path === "/") {
      const { userId } = await auth();
      if (!userId) return redirectToSignIn(request, "/app");
    }
    return routed;
  }

  const { userId } = await auth();

  if (isAuthPath(path)) {
    if (!userId) return routed;
    const next = safeAppPath(request.nextUrl.searchParams.get("redirect_url"), "/app");
    const dest = request.nextUrl.clone();
    const url = new URL(next, request.url);
    dest.pathname = url.pathname;
    dest.search = url.search;
    return NextResponse.redirect(dest);
  }

  if (isProtectedAppPath(path) && !userId) {
    return redirectToSignIn(request, path + request.nextUrl.search);
  }

  return routed;
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY && isClerkHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"))) {
    return withClerk(request, event);
  }
  return hostProxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2)$).*)",
    "/__clerk/(.*)",
  ],
};
