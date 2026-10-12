"use client";

import { useState, useTransition } from "react";

import { markWelcomeSeen } from "@/app/(workspace)/app/onboarding/setup-actions";
import { Notice } from "@/components/ui/states";
import { helperClass } from "@/lib/ui";

/**
 * The first-sign-in welcome for Members and Operators: what they will see,
 * what they can do, and what they cannot. Shown once per person (remembered
 * on the server, so a new device does not show it again). Nothing in it is
 * about another role.
 */
export function RoleWelcome({ copy }: { copy: { title: string; see: string; can: string; cannot: string } }) {
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();
  if (hidden) return null;
  return (
    <div className="mb-4 print:hidden">
      <Notice
        tone="info"
        title={copy.title}
        action={
          <button
            type="button"
            disabled={pending}
            className="text-xs text-silver underline-offset-2 hover:underline"
            onClick={() =>
              start(async () => {
                setHidden(true);
                await markWelcomeSeen();
              })
            }
          >
            Got it
          </button>
        }
      >
        <ul className={`${helperClass} list-disc space-y-1 pl-4`}>
          <li>{copy.see}</li>
          <li>{copy.can}</li>
          <li>{copy.cannot}</li>
        </ul>
      </Notice>
    </div>
  );
}
