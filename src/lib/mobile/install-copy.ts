export const INSTALL_STEPS = {
  ios: [
    "Open this link in Safari. Chrome on iPhone cannot add it to the home screen.",
    "Tap Share, then Add to Home Screen.",
    "Open Vistrial from the icon. Logging an outcome from that icon is how training completes.",
  ],
  android: [
    "Open this link in Chrome.",
    "Tap the menu, then Install app or Add to Home Screen.",
    "Open Vistrial from the icon between calls. That is the surface outcomes are supposed to be logged on.",
  ],
} as const;

export const INSTALL_PLATFORMS: Array<{
  platform: string;
  steps: readonly string[];
}> = [
  { platform: "iPhone", steps: INSTALL_STEPS.ios },
  { platform: "Android", steps: INSTALL_STEPS.android },
];

export const INSTALL_WHY =
  "The numbers this workspace produces depend on logging what happened right after a call. That happens on a phone, not later at a desk.";
