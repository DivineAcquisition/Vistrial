// @ts-nocheck
'use client';

// ============================================
// ADD CONTACT FORM
// ============================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle } from 'lucide-react';
import { SingleNumberValidator } from './single-number-validator';

interface AddContactFormProps {
  organizationId: string;
  onSuccess?: () => void;
}

export function AddContactForm({ organizationId, onSuccess }: AddContactFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [phoneWarning, setPhoneWarning] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    notes: '',
  });
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create contact');
      }

      toast({
        title: 'Contact created',
        description: 'The contact has been added to your database.',
      });

      router.refresh();
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create contact',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="first_name" className="text-gray-300">First Name</Label>
          <Input
            id="first_name"
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            disabled={isLoading}
            className="bg-white border-gray-200 text-gray-900"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name" className="text-gray-300">Last Name</Label>
          <Input
            id="last_name"
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            disabled={isLoading}
            className="bg-white border-gray-200 text-gray-900"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-gray-300">Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          disabled={isLoading}
          className="bg-white border-gray-200 text-gray-900"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone" className="text-gray-300">Phone</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="+1 (555) 123-4567"
          value={formData.phone}
          onChange={(e) => {
            setFormData({ ...formData, phone: e.target.value });
            setPhoneWarning(null);
          }}
          disabled={isLoading}
          className="bg-white border-gray-200 text-gray-900"
        />
        {formData.phone && (
          <SingleNumberValidator
            showInput={false}
            phoneNumber={formData.phone}
            onValidated={(result) => {
              if (!result.canReceiveSMS) {
                setPhoneWarning(
                  result.phoneType === 'landline'
                    ? 'This appears to be a landline and cannot receive SMS'
                    : 'This number may not be able to receive SMS'
                );
              } else {
                setPhoneWarning(null);
              }
            }}
          />
        )}
        {phoneWarning && (
          <p className="text-sm text-amber-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {phoneWarning}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes" className="text-gray-300">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          disabled={isLoading}
          rows={3}
          className="bg-white border-gray-200 text-gray-900"
        />
      </div>

      <Button type="submit" className="w-full bg-brand-600 hover:bg-brand-700" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Creating...
          </>
        ) : (
          'Add Contact'
        )}
      </Button>
    </form>
  );
}
