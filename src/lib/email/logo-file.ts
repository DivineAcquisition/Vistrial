import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { EMAIL_LOGO_CID } from "@/lib/email/layout";

/** The same bytes as public/brand/Vistrial 1.png, attached so the icon does not depend on a remote fetch. */
export function emailLogoAttachment(): {
  filename: string;
  content: Buffer;
  contentType: string;
  contentId: string;
} {
  return {
    filename: "vistrial-icon.png",
    content: readFileSync(path.join(process.cwd(), "public/brand/vistrial-icon.png")),
    contentType: "image/png",
    contentId: EMAIL_LOGO_CID,
  };
}
