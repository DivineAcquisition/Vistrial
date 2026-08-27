"use client";

import { useEffect, useRef } from "react";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { toastManager } from "@/components/ui/toast";

export function useSettingsToast(
  state: SettingsSaveResult,
  pending: boolean,
  savedDescription = "Your changes have been updated.",
) {
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      if (state.status === "saved") {
        toastManager.add({
          title: "Saved",
          description: savedDescription,
          type: "success",
        });
      } else if (state.status === "error") {
        toastManager.add({
          title: "Could not save",
          description: state.error,
          type: "error",
        });
      }
    }
    wasPending.current = pending;
  }, [pending, savedDescription, state]);
}
