"use client";

import { useEffect, useState } from "react";

import { useOrg } from "@/components/app/org-provider";
import { Notice } from "@/components/ui/states";
import { FIRST_RUN, firstRunStorageKey } from "@/lib/first-run";
import { helperClass } from "@/lib/ui";

/**
 * One dismissible explanation the first time someone in this role opens the app.
 * Stored on the device so it does not follow them across computers, and so a
 * promotion to a new role shows that role's version once.
 */
export function FirstRunExplainer() {
  const { role } = useOrg();
  const copy = FIRST_RUN[role];
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(firstRunStorageKey(role)) === "1") {
      setShow(false);
      return;
    }
    setShow(true);
  }, [role]);

  if (!show) return null;

  return (
    <div className="app-scale mb-4 print:hidden">
      <Notice
        tone="info"
        title={copy.title}
        action={
          <button
            type="button"
            className="text-xs text-silver underline-offset-2 hover:underline"
            onClick={() => {
              window.localStorage.setItem(firstRunStorageKey(role), "1");
              setShow(false);
            }}
          >
            Got it
          </button>
        }
      >
        <p className={helperClass}>{copy.body}</p>
      </Notice>
    </div>
  );
}
