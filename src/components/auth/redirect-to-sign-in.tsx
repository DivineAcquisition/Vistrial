"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { safeAppPath } from "@/lib/auth/redirect";

/** The workspace never renders the form. The sign-in page owns that. */
export function RedirectToSignIn() {
  const pathname = usePathname();

  useEffect(() => {
    const next = safeAppPath(pathname, "/app");
    window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(next)}`);
  }, [pathname]);

  return null;
}
