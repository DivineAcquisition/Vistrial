'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2, Phone, Mail, Globe, MapPin } from 'lucide-react';

const BUSINESS_TYPES = [
  { value: 'cleaning_residential', label: 'Residential Cleaning' },
  { value: 'cleaning_commercial', label: 'Commercial Cleaning' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'painting', label: 'Painting' },
  { value: 'pest_control', label: 'Pest Control' },
  { value: 'handyman', label: 'Handyman' },
  { value: 'moving', label: 'Moving Service' },
  { value: 'other', label: 'Other' },
];

const EMPLOYEE_COUNTS = [
  { value: '1', label: 'Just me' },
  { value: '2-5', label: '2-5 employees' },
  { value: '6-10', label: '6-10 employees' },
  { value: '11-25', label: '11-25 employees' },
  { value: '26-50', label: '26-50 employees' },
  { value: '50+', label: '50+ employees' },
];

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

export function BusinessSettingsForm({ organization }: { organization: any }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: organization.name || '',
    phone: organization.phone || '',
    email: organization.email || '',
    website: organization.website || '',
    address: organization.address || '',
    city: organization.city || '',
    state: organization.state || '',
    zip: organization.zip || '',
    logoUrl: organization.logo_url || '',
    businessType: organization.business_type || '',
    businessDescription: organization.business_description || '',
    serviceArea: organization.service_area || '',
    foundedYear: organization.founded_year?.toString() || '',
    employeeCount: organization.employee_count || '',
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch('/api/settings/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          foundedYear: formData.foundedYear ? parseInt(formData.foundedYear) : null,
        }),
      });
      if (!response.ok) { const d = await response.json(); throw new Error(d.error); }
      toast({ title: 'Business settings updated!' });
      router.refresh();
    } catch (error) {
      toast({ title: 'Failed to save', description: error instanceof Error ? error.message : 'Please try again', variant: 'destructive' });
    } finally { setIsLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business Logo</CardTitle>
          <CardDescription>Appears on booking pages and customer communications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20 rounded-xl">
              <AvatarImage src={formData.logoUrl} className="object-cover" />
              <AvatarFallback className="text-xl rounded-xl bg-brand-50"><Building2 className="h-8 w-8 text-brand-500" /></AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="space-y-1.5">
                <Label className="text-xs">Logo URL</Label>
                <Input value={formData.logoUrl} onChange={(e) => handleChange('logoUrl', e.target.value)} placeholder="https://example.com/logo.png" className="text-sm" />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Recommended: Square image, at least 200x200px</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business Information</CardTitle>
          <CardDescription>Basic information about your business</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Business Name *</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input id="name" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} className="pl-10" placeholder="Acme Cleaning Co." required />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Business Type</Label>
              <Select value={formData.businessType} onValueChange={(v) => handleChange('businessType', v)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{BUSINESS_TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Team Size</Label>
              <Select value={formData.employeeCount} onValueChange={(v) => handleChange('employeeCount', v)}>
                <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                <SelectContent>{EMPLOYEE_COUNTS.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Business Description</Label>
            <Textarea value={formData.businessDescription} onChange={(e) => handleChange('businessDescription', e.target.value)} placeholder="Tell customers about your business..." rows={3} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Service Area</Label>
              <Input value={formData.serviceArea} onChange={(e) => handleChange('serviceArea', e.target.value)} placeholder="e.g., Baltimore Metro Area" />
            </div>
            <div className="space-y-2">
              <Label>Founded Year</Label>
              <Input type="number" min="1900" max={new Date().getFullYear()} value={formData.foundedYear} onChange={(e) => handleChange('foundedYear', e.target.value)} placeholder="2020" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact Information</CardTitle>
          <CardDescription>How customers can reach your business</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Business Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input type="tel" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} className="pl-10" placeholder="+1 (555) 000-0000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Business Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input type="email" value={formData.email} onChange={(e) => handleChange('email', e.target.value)} className="pl-10" placeholder="hello@yourbusiness.com" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input type="url" value={formData.website} onChange={(e) => handleChange('website', e.target.value)} className="pl-10" placeholder="https://yourbusiness.com" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business Address</CardTitle>
          <CardDescription>Your physical business location</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Street Address</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={formData.address} onChange={(e) => handleChange('address', e.target.value)} className="pl-10" placeholder="123 Main Street" />
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={formData.city} onChange={(e) => handleChange('city', e.target.value)} placeholder="Baltimore" />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Select value={formData.state} onValueChange={(v) => handleChange('state', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{US_STATES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ZIP Code</Label>
              <Input value={formData.zip} onChange={(e) => handleChange('zip', e.target.value)} placeholder="21201" />
            </div>
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
