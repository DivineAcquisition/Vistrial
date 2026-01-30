"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { RiCloseLine, RiAddLine, RiLoader4Line } from "@remixicon/react"
import { Checkbox } from "@/components/Checkbox"
import { createClient } from "@/lib/supabase/client"

interface JobType {
  id: string
  name: string
}

interface Sequence {
  id: string
  name: string
}

interface AddLeadModalProps {
  onClose: () => void
  onSubmit: (data: {
    name: string
    phone: string
    email?: string
    quoteAmount: number
    jobTypeId?: string
    sequenceId?: string
    notes?: string
  }) => Promise<void>
  jobTypes?: JobType[]
}

export function AddLeadModal({ onClose, onSubmit, jobTypes = [] }: AddLeadModalProps) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [quoteAmount, setQuoteAmount] = useState("")
  const [jobTypeId, setJobTypeId] = useState("")
  const [sequenceId, setSequenceId] = useState("")
  const [notes, setNotes] = useState("")
  const [startImmediately, setStartImmediately] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sequences, setSequences] = useState<Sequence[]>([])
  
  const supabase = useMemo(() => createClient(), [])

  // Fetch sequences
  useEffect(() => {
    const fetchSequences = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from("sequences")
        .select("id, name")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("name")

      if (data) {
        setSequences(data)
        // Set default sequence if available
        if (data.length > 0) {
          setSequenceId(data[0].id)
        }
      }
    }

    fetchSequences()
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name || !phone) {
      alert("Name and phone are required")
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        name,
        phone,
        email: email || undefined,
        quoteAmount: parseFloat(quoteAmount) || 0,
        jobTypeId: jobTypeId || undefined,
        sequenceId: startImmediately && sequenceId ? sequenceId : undefined,
        notes: notes || undefined,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">
            Add New Lead
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <RiCloseLine className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 p-6">
            {/* Contact */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name" className="font-medium">
                  Name *
                </Label>
                <Input
                  type="text"
                  id="name"
                  placeholder="John Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone" className="font-medium">
                  Phone *
                </Label>
                <Input
                  type="tel"
                  id="phone"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="email" className="font-medium">
                  Email
                </Label>
                <Input
                  type="email"
                  id="email"
                  placeholder="john@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Quote */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quoteAmount" className="font-medium">
                  Quote Amount
                </Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    $
                  </span>
                  <Input
                    type="number"
                    id="quoteAmount"
                    placeholder="0.00"
                    value={quoteAmount}
                    onChange={(e) => setQuoteAmount(e.target.value)}
                    className="pl-8"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="jobType" className="font-medium">
                  Job Type
                </Label>
                <Select value={jobTypeId} onValueChange={setJobTypeId}>
                  <SelectTrigger id="jobType" className="mt-1">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {jobTypes.length === 0 ? (
                      <SelectItem value="none" disabled>No job types defined</SelectItem>
                    ) : (
                      jobTypes.map((jt) => (
                        <SelectItem key={jt.id} value={jt.id}>
                          {jt.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sequence */}
            <div>
              <Label htmlFor="sequence" className="font-medium">
                Follow-Up Sequence
              </Label>
              <Select value={sequenceId} onValueChange={setSequenceId}>
                <SelectTrigger id="sequence" className="mt-1">
                  <SelectValue placeholder="Select sequence..." />
                </SelectTrigger>
                <SelectContent>
                  {sequences.length === 0 ? (
                    <SelectItem value="none" disabled>No sequences defined</SelectItem>
                  ) : (
                    sequences.map((seq) => (
                      <SelectItem key={seq.id} value={seq.id}>
                        {seq.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Start immediately */}
            {sequences.length > 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-brand-50 p-4 dark:bg-brand-950/20">
                <Checkbox
                  id="startImmediately"
                  checked={startImmediately}
                  onCheckedChange={(checked) => setStartImmediately(!!checked)}
                />
                <label htmlFor="startImmediately" className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Start sequence immediately</span>
                  <span className="block text-gray-500 dark:text-gray-400">
                    First message will be sent right away
                  </span>
                </label>
              </div>
            )}

            {/* Notes */}
            <div>
              <Label htmlFor="notes" className="font-medium">
                Notes
              </Label>
              <textarea
                id="notes"
                rows={2}
                placeholder="Any additional context..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-gray-800 dark:bg-gray-950 dark:focus:ring-brand-700/30"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 p-6 dark:border-gray-800">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <RiLoader4Line className="h-5 w-5 animate-spin" />
              ) : (
                <RiAddLine className="h-5 w-5" />
              )}
              {isSubmitting ? "Adding..." : "Add Lead"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
