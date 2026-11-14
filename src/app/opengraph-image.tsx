import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { HERO } from "@/lib/marketing/copy";
import { APP_NAME } from "@/lib/constants";

export const alt = HERO.headline;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The share card: the headline on the brand's near-black, a violet aura and faint grid like the landing
 * page's agentic visuals, and the app icon (the crest on its purple square) beside the name.
 */
export default async function Image() {
  const font = await readFile(join(process.cwd(), "src/fonts/InterDisplay-SemiBold.ttf"));
  let markSrc: string | null = null;
  try {
    const mark = await readFile(join(process.cwd(), "public/icons/icon-192.png"));
    markSrc = `data:image/png;base64,${mark.toString("base64")}`;
  } catch {
    markSrc = null;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #0b0a14 0%, #120f24 55%, #1e1940 100%)",
          color: "#ffffff",
          fontFamily: "Inter Display",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage:
              "linear-gradient(rgba(154,136,252,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(154,136,252,0.09) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "-180px",
            right: "-120px",
            width: "760px",
            height: "620px",
            display: "flex",
            background: "radial-gradient(ellipse at center, rgba(154,136,252,0.45) 0%, rgba(102,80,216,0.18) 40%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: "4px",
            display: "flex",
            background: "linear-gradient(90deg, transparent 0%, #9a88fc 35%, #6650d8 70%, transparent 100%)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {markSrc ? <img src={markSrc} width={64} height={64} alt="" style={{ borderRadius: "14px" }} /> : null}
          <div style={{ fontSize: 34, fontWeight: 600, color: "#ffffff" }}>{APP_NAME}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "980px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: 20, color: "#c3b6fe", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "999px", background: "#9a88fc", display: "flex" }} />
            Agentic workforce
          </div>
          <div style={{ fontSize: 72, fontWeight: 600, lineHeight: 1.04, letterSpacing: "-0.035em" }}>{HERO.headline}</div>
          <div style={{ fontSize: 24, color: "#b4b0c8", lineHeight: 1.4, maxWidth: "900px" }}>{HERO.trust}</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Inter Display", data: font, style: "normal", weight: 600 }],
    },
  );
}
