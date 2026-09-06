import localFont from "next/font/local";
import { Geist_Mono, Instrument_Serif } from "next/font/google";

/**
 * Inter Display across UI type. The variable files include the opsz axis;
 * locking it to 32 in the @font-face is the Display cut at every size.
 * Geist Mono stays on code, kbd, and pre.
 * Instrument Serif is marketing display only — Tiempos-like headlines on the
 * public site, not in the operator app.
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
  // Single quotes: next/font serializes this into a query string and
  // double-quoted `"opsz"` breaks that parse.
  declarations: [{ prop: "font-variation-settings", value: "'opsz' 32" }],
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});
