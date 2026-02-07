// ============================================
// Settings index - redirect to services
// ============================================

import { redirect } from "next/navigation"

export default function SettingsPage() {
  redirect("/settings/services")
}
