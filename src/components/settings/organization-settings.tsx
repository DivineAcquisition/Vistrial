// @ts-nocheck
'use client';

// ============================================
// ORGANIZATION SETTINGS
// ============================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { BUSINESS_TYPES } from '@/constants/business-types';
import type { Organization } from '@/types/database';

interface OrganizationSettingsProps {
  organization: Organization;
  isOwner: boolean;
}

export function OrganizationSettings({
  organization,
  isOwner,
}: OrganizationSettingsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: organization.name,
    phone: organization.phone || '',
    email: organization.email || '',
    website: organization.website || '',
    business_type: organization.business_type || '',
    timezone: organization.timezone || 'America/New_York',
  });
  const router = useRouter();
  const { toast } = useToast();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to update organization');
      }

      toast({
        title: 'Settings saved',
        description: 'Organization settings have been updated.',
      });

      router.refresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white/80 border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Organization Details</CardTitle>
          <CardDescription className="text-gray-400">
            Basic information about your business
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName" className="text-gray-300">Business Name</Label>
              <Input
                id="orgName"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={isLoading || !isOwner}
                className="bg-gray-800 border-gray-200 text-gray-900"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessType" className="text-gray-300">Business Type</Label>
              <Select
                value={formData.business_type}
                onValueChange={(value) => setFormData({ ...formData, business_type: value })}
                disabled={isLoading || !isOwner}
              >
                <SelectTrigger className="bg-gray-800 border-gray-200 text-gray-900">
                  <SelectValue placeholder="Select business type" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  {BUSINESS_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value} className="text-gray-300 focus:text-gray-900 focus:bg-gray-50">
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-gray-300">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  disabled={isLoading || !isOwner}
                  className="bg-gray-800 border-gray-200 text-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-300">Business Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={isLoading || !isOwner}
                  className="bg-gray-800 border-gray-200 text-gray-900"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website" className="text-gray-300">Website</Label>
              <Input
                id="website"
                type="url"
                placeholder="https://example.com"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                disabled={isLoading || !isOwner}
                className="bg-gray-800 border-gray-200 text-gray-900"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone" className="text-gray-300">Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => setFormData({ ...formData, timezone: value })}
                disabled={isLoading || !isOwner}
              >
                <SelectTrigger className="bg-gray-800 border-gray-200 text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  <SelectItem value="America/New_York" className="text-gray-300 focus:text-gray-900 focus:bg-gray-50">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago" className="text-gray-300 focus:text-gray-900 focus:bg-gray-50">Central Time</SelectItem>
                  <SelectItem value="America/Denver" className="text-gray-300 focus:text-gray-900 focus:bg-gray-50">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles" className="text-gray-300 focus:text-gray-900 focus:bg-gray-50">Pacific Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isOwner && (
              <Button type="submit" disabled={isLoading} className="bg-brand-600 hover:bg-brand-700">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            )}

            {!isOwner && (
              <p className="text-sm text-gray-500">
                Only the organization owner can edit these settings.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card className="bg-white/80 border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Messaging Settings</CardTitle>
          <CardDescription className="text-gray-400">
            Configure links used in your message templates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MessagingSettings organization={organization} isOwner={isOwner} />
        </CardContent>
      </Card>
    </div>
  );
}

function MessagingSettings({
  organization,
  isOwner,
}: {
  organization: Organization;
  isOwner: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const settings = (organization.settings as any) || {};
  const [reviewLink, setReviewLink] = useState(settings.review_link || '');
  const [bookingLink, setBookingLink] = useState(settings.booking_link || '');
  const router = useRouter();
  const { toast } = useToast();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/organization/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_link: reviewLink,
          booking_link: bookingLink,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      toast({
        title: 'Settings saved',
        description: 'Messaging settings have been updated.',
      });

      router.refresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="reviewLink" className="text-gray-300">Review Link</Label>
        <Input
          id="reviewLink"
          type="url"
          placeholder="https://google.com/maps/..."
          value={reviewLink}
          onChange={(e) => setReviewLink(e.target.value)}
          disabled={isLoading || !isOwner}
          className="bg-gray-800 border-gray-200 text-gray-900"
        />
        <p className="text-xs text-gray-500">
          Used in review request workflows (&#123;&#123;review_link&#125;&#125;)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bookingLink" className="text-gray-300">Booking Link</Label>
        <Input
          id="bookingLink"
          type="url"
          placeholder="https://calendly.com/..."
          value={bookingLink}
          onChange={(e) => setBookingLink(e.target.value)}
          disabled={isLoading || !isOwner}
          className="bg-gray-800 border-gray-200 text-gray-900"
        />
        <p className="text-xs text-gray-500">
          Used in booking workflows (&#123;&#123;booking_link&#125;&#125;)
        </p>
      </div>

      {isOwner && (
        <Button type="submit" disabled={isLoading} className="bg-brand-600 hover:bg-brand-700">
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </Button>
      )}
    </form>
  );
}
