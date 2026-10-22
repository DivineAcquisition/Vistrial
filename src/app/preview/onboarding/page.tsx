import { notFound } from "next/navigation"

import InteractiveOnboardingChecklistDemo from "@/components/ui/onboarding-checklist-demo"
import { TextureButtonDemo } from "@/components/ui/texture-button-demo"

export const dynamic = "force-dynamic"

/** Development only. The checklist is not wired into the product yet. */
export default function OnboardingPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return (
    <div>
      <TextureButtonDemo />
      <InteractiveOnboardingChecklistDemo />
    </div>
  )
}
