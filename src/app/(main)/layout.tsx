"use client"

import { VistrialLayout } from "@/components/ui/navigation/VistrialLayout"
import { useState } from "react"
import { AddLeadModal } from "@/components/ui/leads/AddLeadModal"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [showAddLeadModal, setShowAddLeadModal] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleAddLead = async (leadData: {
    name: string
    phone: string
    email?: string
    quoteAmount: number
    jobTypeId?: string
    sequenceId?: string
    notes?: string
  }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { error } = await supabase.from("leads").insert({
        user_id: user.id,
        name: leadData.name,
        phone: leadData.phone,
        email: leadData.email,
        quote_amount: leadData.quoteAmount,
        job_type_id: leadData.jobTypeId || null,
        sequence_id: leadData.sequenceId || null,
        notes: leadData.notes,
        status: leadData.sequenceId ? "in_sequence" : "new",
        consent_method: "manual",
        consent_timestamp: new Date().toISOString(),
      })

      if (error) throw error

      setShowAddLeadModal(false)
      router.refresh()
    } catch (err) {
      console.error("Error adding lead:", err)
      alert("Failed to add lead")
    }
  }

  return (
    <>
      <VistrialLayout onAddLead={() => setShowAddLeadModal(true)}>
        {children}
      </VistrialLayout>
      {showAddLeadModal && (
        <AddLeadModal
          onClose={() => setShowAddLeadModal(false)}
          onSubmit={handleAddLead}
        />
      )}
    </>
  )
}
