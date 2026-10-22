import { notFound } from "next/navigation";

import LiveOrbDemo from "@/components/ui/live-orb-demo";

export const dynamic = "force-dynamic";

/** Development only. The three orb materials, and the faces the agents wear. */
export default function OrbPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LiveOrbDemo />;
}
