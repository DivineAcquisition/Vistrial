'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, User, Mail, Phone, Globe } from 'lucide-react';

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'UTC', label: 'UTC' },
];

interface ProfileSettingsFormProps {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    avatarUrl: string;
    timezone: string;
  };
}

export function ProfileSettingsForm({ user }: ProfileSettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    timezone: user.timezone,
    avatarUrl: user.avatarUrl,
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      toast({ title: 'Profile updated successfully!' });
      router.refresh();
    } catch (error) {
      toast({
        title: 'Failed to save',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = () => {
    const first = formData.firstName?.[0] || '';
    const last = formData.lastName?.[0] || '';
    return (first + last).toUpperCase() || user.email[0].toUpperCase();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Avatar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile Photo</CardTitle>
          <CardDescription>Upload a photo to personalize your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20">
              <AvatarImage src={formData.avatarUrl} />
              <AvatarFallback className="text-xl bg-brand-50 text-brand-600">{getInitials()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="space-y-1.5">
                <Label className="text-xs">Avatar URL</Label>
                <Input
                  value={formData.avatarUrl}
                  onChange={(e) => handleChange('avatarUrl', e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                  className="text-sm"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Enter a URL to your profile photo</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
          <CardDescription>Your personal details and contact information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input id="firstName" value={formData.firstName} onChange={(e) => handleChange('firstName', e.target.value)} className="pl-10" placeholder="John" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" value={formData.lastName} onChange={(e) => handleChange('lastName', e.target.value)} placeholder="Doe" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input id="email" type="email" value={user.email} className="pl-10 bg-gray-50" disabled />
            </div>
            <p className="text-[11px] text-gray-400">Contact support to change your email</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input id="phone" type="tel" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} className="pl-10" placeholder="+1 (555) 000-0000" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferences</CardTitle>
          <CardDescription>Customize your experience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={formData.timezone} onValueChange={(value) => handleChange('timezone', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading} variant="gradient" className="rounded-xl">
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </form>
  );
}
