"use client"

import { VistrialLayout } from "@/components/ui/navigation/VistrialLayout"
import { useState } from "react"
import { AddLeadModal } from "@/components/ui/leads/AddLeadModal"

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [showAddLeadModal, setShowAddLeadModal] = useState(false)

  return (
    <>
      <VistrialLayout onAddLead={() => setShowAddLeadModal(true)}>
        {children}
      </VistrialLayout>
      {showAddLeadModal && (
        <AddLeadModal onClose={() => setShowAddLeadModal(false)} />
      )}
    </>
  )
}
