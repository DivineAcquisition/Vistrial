import type { ClerkAppearanceTheme } from "@clerk/shared/types";

/**
 * Clerk's own card, restyled onto the workspace palette.
 * Filled actions stay #9A88FC with near-black type, the same as the product buttons.
 */
export const authAppearance = {
  variables: {
    colorPrimary: "#9A88FC",
    colorPrimaryForeground: "#07070b",
    colorDanger: "#dc2626",
    colorSuccess: "#059669",
    colorWarning: "#d97706",
    colorBackground: "transparent",
    colorForeground: "var(--strong)",
    colorMutedForeground: "var(--muted-foreground)",
    colorNeutral: "var(--strong)",
    colorInput: "var(--field-bg)",
    colorInputForeground: "var(--strong)",
    colorRing: "#9A88FC",
    colorBorder: "var(--border)",
    borderRadius: "0.75rem",
    fontFamily: "inherit",
    fontFamilyButtons: "inherit",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none!",
    card: "w-full gap-4 rounded-none border-0 bg-transparent p-6 shadow-none!",
    header: "hidden!",
    footer: "bg-transparent!",
    footerAction: "bg-transparent!",
    socialButtonsBlockButton:
      "h-11 rounded-xl border border-border bg-card text-sm font-medium text-strong shadow-none! hover:bg-muted",
    socialButtonsBlockButtonText: "font-medium text-strong",
    dividerLine: "bg-border",
    dividerText: "text-xs text-muted-foreground",
    formFieldLabel: "text-sm font-medium text-strong",
    formFieldInput:
      "h-11 rounded-xl border border-input bg-[var(--field-bg)] text-sm text-strong shadow-none!",
    formButtonPrimary:
      "h-11 rounded-xl border border-[#6650d8]/25 bg-gradient-to-b from-[#d9d1fe] via-[#c3b6fe] to-[#9a88fc] text-sm font-medium text-[#07070b] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]! hover:from-[#ebe7ff] hover:via-[#d9d1fe] hover:to-[#ae9dfd]",
    footerActionLink: "font-medium text-brand-300 hover:text-brand-200",
    footerActionText: "text-muted-foreground",
    identityPreview: "rounded-xl border border-border bg-muted",
    formFieldInputShowPasswordButton: "text-muted-foreground",
    otpCodeFieldInput: "rounded-xl border border-input",
    alertText: "text-sm",
    formFieldErrorText: "text-sm text-destructive",
  },
} satisfies ClerkAppearanceTheme;
