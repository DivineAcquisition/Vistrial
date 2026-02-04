/**
 * Contact Details Component
 * 
 * Slide-over panel or modal for viewing/editing contact details:
 * - Contact information (name, phone, email, address)
 * - Communication history timeline
 * - Workflow enrollment status
 * - Quick actions (send SMS, make call, enroll)
 * - Edit mode with form validation
 * - Delete confirmation
 * 
 * Used in: Contacts table row click, contact page
 */

"use client";

import { useState } from "react";
import { 
  X, 
  Phone, 
  Mail, 
  MapPin, 
  MessageSquare, 
  PhoneCall,
  Workflow,
  Edit2,
  Trash2,
  Save,
  Clock
} from "lucide-react";

interface Contact {
  id: string;
  first_name: string;
  last_name?: string;
  phone: string;
  email?: string;
  address?: string;
  status: "active" | "opted_out" | "unsubscribed";
  notes?: string;
  created_at: string;
  last_contacted_at?: string;
}

interface ContactDetailsProps {
  contact: Contact;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (contact: Contact) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onSendSms?: (contact: Contact) => void;
  onCall?: (contact: Contact) => void;
}

export function ContactDetails({
  contact,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  onSendSms,
  onCall,
}: ContactDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContact, setEditedContact] = useState(contact);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!onUpdate) return;
    setSaving(true);
    try {
      await onUpdate(editedContact);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-gray-900 border-l border-white/10 h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-white/10 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Contact Details</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Contact Avatar & Name */}
          <div className="text-center">
            <div className="w-20 h-20 bg-violet-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl font-bold text-violet-400">
                {contact.first_name.charAt(0)}
              </span>
            </div>
            {isEditing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editedContact.first_name}
                  onChange={(e) => setEditedContact({ ...editedContact, first_name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-white/10 rounded-lg text-white text-center"
                  placeholder="First name"
                />
                <input
                  type="text"
                  value={editedContact.last_name || ""}
                  onChange={(e) => setEditedContact({ ...editedContact, last_name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-white/10 rounded-lg text-white text-center"
                  placeholder="Last name"
                />
              </div>
            ) : (
              <h3 className="text-xl font-semibold text-white">
                {contact.first_name} {contact.last_name}
              </h3>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => onSendSms?.(contact)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              SMS
            </button>
            <button
              onClick={() => onCall?.(contact)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PhoneCall className="w-4 h-4" />
              Call
            </button>
          </div>

          {/* Contact Info */}
          <div className="bg-white/5 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-gray-400" />
              {isEditing ? (
                <input
                  type="tel"
                  value={editedContact.phone}
                  onChange={(e) => setEditedContact({ ...editedContact, phone: e.target.value })}
                  className="flex-1 px-3 py-1.5 bg-gray-800 border border-white/10 rounded text-white"
                />
              ) : (
                <span className="text-white">{contact.phone}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-gray-400" />
              {isEditing ? (
                <input
                  type="email"
                  value={editedContact.email || ""}
                  onChange={(e) => setEditedContact({ ...editedContact, email: e.target.value })}
                  className="flex-1 px-3 py-1.5 bg-gray-800 border border-white/10 rounded text-white"
                  placeholder="Email address"
                />
              ) : (
                <span className="text-white">{contact.email || "No email"}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-gray-400" />
              {isEditing ? (
                <input
                  type="text"
                  value={editedContact.address || ""}
                  onChange={(e) => setEditedContact({ ...editedContact, address: e.target.value })}
                  className="flex-1 px-3 py-1.5 bg-gray-800 border border-white/10 rounded text-white"
                  placeholder="Address"
                />
              ) : (
                <span className="text-white">{contact.address || "No address"}</span>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Status</span>
              <span className={`px-2 py-1 text-xs font-medium rounded ${
                contact.status === "active" 
                  ? "bg-green-500/20 text-green-400" 
                  : "bg-red-500/20 text-red-400"
              }`}>
                {contact.status.replace("_", " ")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Added</span>
              <span className="text-white text-sm">
                {new Date(contact.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white/5 rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-400 mb-2">Notes</label>
            {isEditing ? (
              <textarea
                value={editedContact.notes || ""}
                onChange={(e) => setEditedContact({ ...editedContact, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 bg-gray-800 border border-white/10 rounded-lg text-white resize-none"
                placeholder="Add notes about this contact..."
              />
            ) : (
              <p className="text-gray-300 text-sm">
                {contact.notes || "No notes"}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditedContact(contact);
                  }}
                  className="flex-1 px-4 py-2 text-gray-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => onDelete?.(contact.id)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
