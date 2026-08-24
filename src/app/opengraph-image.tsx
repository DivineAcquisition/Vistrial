import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { HERO } from "@/lib/marketing/copy";
import { APP_NAME } from "@/lib/constants";

export const alt = HERO.headline;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  let markSrc: string | null = null;
  try {
    const mark = await readFile(join(process.cwd(), "public/brand/vistrial-crest.png"));
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
          background: "#07070b",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-20%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "900px",
            height: "520px",
            background: "radial-gradient(ellipse at center, rgba(154,136,252,0.32) 0%, transparent 70%)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {markSrc ? <img src={markSrc} width={40} height={40} alt="" /> : null}
          <div style={{ fontSize: 28, fontWeight: 600, color: "#c3b6fe" }}>{APP_NAME}</div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            maxWidth: "920px",
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontWeight: 600,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
            }}
          >
            {HERO.headline}
          </div>
          <div style={{ fontSize: 24, color: "#a3a3a3", lineHeight: 1.35 }}>
            {HERO.underCta}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
