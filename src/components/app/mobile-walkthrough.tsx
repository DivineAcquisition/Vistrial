"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { markMobileTraining } from "@/app/app/log/actions";
import { Notice } from "@/components/ui/states";
import { detectClientSurface } from "@/lib/mobile/surface";
import { btnPrimary, btnSizeLg, helperClass } from "@/lib/ui";

/**
 * A setter is not trained until they log an outcome from a phone. The first
 * mobile session walks that once, from the bottom of the thumb zone.
 */
export function MobileWalkthroughNotice({ needed }: { needed: boolean }) {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!needed) {
      setShow(false);
      return;
    }
    if (detectClientSurface() !== "mobile") return;
    void markMobileTraining("session");
    setShow(!pathname.startsWith("/app/log"));
  }, [needed, pathname]);

  if (!show) return null;

  return (
    <div className="mb-4 print:hidden">
      <Notice tone="info" title="One outcome from this phone">
        <p className={helperClass}>
          Training is not complete until you log what happened after a contact, from here, without
          typing. That is the input every other number depends on.
        </p>
        <Link href="/app/log" className={`${btnPrimary} ${btnSizeLg} mt-3 inline-flex`}>
          Log an outcome
        </Link>
      </Notice>
    </div>
  );
}
