// @ts-nocheck
"use client"

/**
 * New Quote Page
 * Create a new quote with the QuoteCreator component
 */

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { QuoteCreator, QuoteFormData } from "@/components/quotes/QuoteCreator"
import type { Contact, ServiceType, CostSettings } from "@/types/quotes"
import { DEFAULT_COST_SETTINGS } from "@/lib/quotes/calculations"

export default function NewQuotePage() {
  const router = useRouter()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
  const [costSettings] = useState<CostSettings>(DEFAULT_COST_SETTINGS)
  const [loading, setLoading] = useState(true)

  // Fetch data on mount
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch leads as contacts
        const leadsRes = await fetch("/api/leads")
        if (leadsRes.ok) {
          const leadsData = await leadsRes.json()
          const contactsList: Contact[] = (leadsData.leads || []).map((lead: { id: string; name: string; phone: string; email: string }) => ({
            id: lead.id,
            first_name: lead.name?.split(" ")[0] || "",
            last_name: lead.name?.split(" ").slice(1).join(" ") || "",
            phone: lead.phone,
            email: lead.email,
          }))
          setContacts(contactsList)
        }

        // Fetch job types as service types
        const jobTypesRes = await fetch("/api/job-types")
        if (jobTypesRes.ok) {
          const jobTypesData = await jobTypesRes.json()
          const servicesList: ServiceType[] = (jobTypesData.jobTypes || []).map((jt: { id: string; name: string }) => ({
            id: jt.id,
            name: jt.name,
            pricing_type: "variable",
            base_price: 0,
            price_1bed: 100,
            price_2bed: 130,
            price_3bed: 160,
            price_4bed: 190,
            price_5bed_plus: 220,
            price_per_bathroom: 15,
          }))
          setServiceTypes(servicesList)
        }
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Handle save
  const handleSave = async (data: QuoteFormData) => {
    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: data.contactId,
          service_type_id: data.serviceTypeId,
          address_line1: data.addressLine1,
          city: data.city,
          state: data.state,
          zip: data.zip,
          sqft: data.sqft,
          bedrooms: data.bedrooms,
          bathrooms: data.bathrooms,
          property_type: data.propertyType,
          property_condition: data.propertyCondition,
          has_pets: data.hasPets,
          pet_details: data.petDetails,
          pricing_method: data.pricingMethod,
          custom_price: data.customPrice,
          adjustments: data.adjustments,
          discount_amount: data.discountAmount,
          discount_reason: data.discountReason,
          internal_notes: data.internalNotes,
          send_immediately: false,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        router.push(`/quotes/${result.quote.id}`)
      } else {
        const error = await response.json()
        alert(error.error || "Failed to save quote")
      }
    } catch (error) {
      console.error("Save error:", error)
      alert("Failed to save quote")
    }
  }

  // Handle send
  const handleSend = async (data: QuoteFormData) => {
    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: data.contactId,
          service_type_id: data.serviceTypeId,
          address_line1: data.addressLine1,
          city: data.city,
          state: data.state,
          zip: data.zip,
          sqft: data.sqft,
          bedrooms: data.bedrooms,
          bathrooms: data.bathrooms,
          property_type: data.propertyType,
          property_condition: data.propertyCondition,
          has_pets: data.hasPets,
          pet_details: data.petDetails,
          pricing_method: data.pricingMethod,
          custom_price: data.customPrice,
          adjustments: data.adjustments,
          discount_amount: data.discountAmount,
          discount_reason: data.discountReason,
          internal_notes: data.internalNotes,
          send_immediately: true,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        router.push(`/quotes/${result.quote.id}`)
      } else {
        const error = await response.json()
        alert(error.error || "Failed to send quote")
      }
    } catch (error) {
      console.error("Send error:", error)
      alert("Failed to send quote")
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Create Quote</h1>
          <p className="text-gray-500 dark:text-gray-400">Build a quote with built-in profit calculator</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Create Quote</h1>
        <p className="text-gray-500 dark:text-gray-400">Build a quote with built-in profit calculator</p>
      </div>

      <QuoteCreator
        contacts={contacts}
        serviceTypes={serviceTypes}
        costSettings={costSettings}
        onSave={handleSave}
        onSend={handleSend}
      />
    </div>
  )
}
