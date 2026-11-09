"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { setErrorNavigator } from "@/lib/errors/show-error";

/** Lets error pop-ups open another page (Billing, for one) with the app's router. Renders nothing. */
export function ErrorNavigator() {
  const router = useRouter();
  useEffect(() => {
    setErrorNavigator((href) => router.push(href));
    return () => setErrorNavigator(null);
  }, [router]);
  return null;
}
