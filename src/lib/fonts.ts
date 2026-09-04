import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";

/**
 * Inter Display across UI type. The variable files include the opsz axis;
 * locking it to 32 in the @font-face is the Display cut at every size.
 * Geist Mono stays on code, kbd, and pre.
 */
export const interDisplay = localFont({
  src: [
    {
      path: "../fonts/InterVariable.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../fonts/InterVariable-Italic.woff2",
      weight: "100 900",
      style: "italic",
    },
  ],
  variable: "--font-sans",
  display: "swap",
  declarations: [{ prop: "font-variation-settings", value: '"opsz" 32' }],
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
