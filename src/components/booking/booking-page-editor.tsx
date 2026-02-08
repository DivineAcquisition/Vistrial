'use client';

// ============================================
// BOOKING PAGE EDITOR
// Full editor with live preview, advanced customization,
// form field configuration, SEO settings, and embed codes
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Monitor,
  Smartphone,
  Palette,
  Settings,
  FileText,
  Code,
  Search,
  Copy,
  Check,
  ExternalLink,
  Type,
  Layout,
  Globe,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils/cn';
import { BookingPagePreview } from './booking-page-preview';
import { EmbedCodeGenerator } from './embed-code-generator';

interface BookingPageEditorProps {
  bookingPage: any;
  pricingMatrices: any[];
  organization: any;
}

const PRESET_COLORS = [
  { name: 'Brand', value: '#5347d1' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Purple', value: '#7c3aed' },
  { name: 'Green', value: '#059669' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Teal', value: '#0d9488' },
];

const FONT_OPTIONS = [
  { name: 'System Default', value: 'system-ui' },
  { name: 'Inter', value: 'Inter' },
  { name: 'Roboto', value: 'Roboto' },
  { name: 'Open Sans', value: 'Open Sans' },
  { name: 'Lato', value: 'Lato' },
  { name: 'Poppins', value: 'Poppins' },
  { name: 'Montserrat', value: 'Montserrat' },
];

export function BookingPageEditor({
  bookingPage,
  pricingMatrices,
  organization,
}: BookingPageEditorProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [activeTab, setActiveTab] = useState('content');
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: bookingPage.name || '',
    slug: bookingPage.slug || '',
    pricingMatrixId: bookingPage.pricing_matrix_id || '',
    active: bookingPage.active ?? true,

    // Settings
    settings: {
      requirePhone: bookingPage.settings?.requirePhone ?? true,
      requireEmail: bookingPage.settings?.requireEmail ?? false,
      requireAddress: bookingPage.settings?.requireAddress ?? false,
      showPricing: bookingPage.settings?.showPricing ?? true,
      showEstimate: bookingPage.settings?.showEstimate ?? true,
      allowDateSelection: bookingPage.settings?.allowDateSelection ?? true,
      allowTimeSelection: bookingPage.settings?.allowTimeSelection ?? false,
      leadTime: bookingPage.settings?.leadTime ?? 24,
      maxAdvance: bookingPage.settings?.maxAdvance ?? 30,
      confirmationMessage:
        bookingPage.settings?.confirmationMessage ||
        "Thanks! We'll be in touch shortly to confirm your booking.",
      notificationEmail: bookingPage.settings?.notificationEmail || '',
      notificationSms: bookingPage.settings?.notificationSms ?? true,
    },

    // Customization
    customization: {
      logo: bookingPage.customization?.logo || '',
      primaryColor: bookingPage.customization?.primaryColor || '#5347d1',
      backgroundColor: bookingPage.customization?.backgroundColor || '#ffffff',
      textColor: bookingPage.customization?.textColor || '#1a1a1a',
      fontFamily: bookingPage.customization?.fontFamily || 'system-ui',
      borderRadius: bookingPage.customization?.borderRadius ?? 12,
      headline:
        bookingPage.customization?.headline || `Book with ${organization.name}`,
      subheadline:
        bookingPage.customization?.subheadline ||
        'Get an instant quote and schedule your service',
      ctaText: bookingPage.customization?.ctaText || 'Request Booking',
      thankYouTitle:
        bookingPage.customization?.thankYouTitle || 'Booking Request Received!',
      thankYouMessage:
        bookingPage.customization?.thankYouMessage ||
        "You're all set! We'll contact you within 24 hours to confirm.",
      showPoweredBy: bookingPage.customization?.showPoweredBy ?? true,
      footerText: bookingPage.customization?.footerText || '',
      showTestimonial: bookingPage.customization?.showTestimonial ?? false,
      testimonialText: bookingPage.customization?.testimonialText || '',
      testimonialAuthor: bookingPage.customization?.testimonialAuthor || '',
    },

    // SEO
    seo: {
      metaTitle: bookingPage.seo?.metaTitle || '',
      metaDescription: bookingPage.seo?.metaDescription || '',
      ogImage: bookingPage.seo?.ogImage || '',
    },
  });

  // Track changes (skip initial mount)
  const [isInitialized, setIsInitialized] = useState(false);
  useEffect(() => {
    if (isInitialized) {
      setHasChanges(true);
    } else {
      setIsInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  const handleChange = useCallback((path: string, value: any) => {
    setFormData((prev) => {
      const newData = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let current = newData;

      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;

      return newData;
    });
  }, []);

  const handleSave = async () => {
    if (!formData.name || !formData.slug) {
      toast({
        title: 'Missing required fields',
        description: 'Please enter a name and URL for your booking page',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/booking/pages/${bookingPage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug,
          pricingMatrixId: formData.pricingMatrixId,
          active: formData.active,
          settings: formData.settings,
          customization: formData.customization,
          seo: formData.seo,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save');
      }

      setHasChanges(false);
      toast({ title: 'Booking page saved!' });
      router.refresh();
    } catch (error) {
      toast({
        title: 'Save failed',
        description:
          error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const bookingUrl = `https://vistrial.io/book/${formData.slug}`;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col -m-4 md:-m-8 lg:-mt-8">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/booking">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-sm">
                {formData.name || 'Untitled'}
              </h1>
              {hasChanges && (
                <Badge variant="outline" className="text-[10px]">
                  Unsaved
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              vistrial.io/book/{formData.slug}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Preview Toggle */}
          <div className="flex items-center gap-0.5 border rounded-lg p-0.5">
            <Button
              variant={previewDevice === 'desktop' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2"
              onClick={() => setPreviewDevice('desktop')}
            >
              <Monitor className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={previewDevice === 'mobile' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2"
              onClick={() => setPreviewDevice('mobile')}
            >
              <Smartphone className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? (
              <>
                <EyeOff className="h-3.5 w-3.5 mr-1" />
                Hide
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 mr-1" />
                Preview
              </>
            )}
          </Button>

          <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Live
            </Button>
          </a>

          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
            variant="gradient"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Panel */}
        <div
          className={cn(
            'border-r bg-white overflow-y-auto',
            showPreview ? 'w-[400px] shrink-0' : 'flex-1 max-w-2xl mx-auto'
          )}
        >
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="h-full"
          >
            <div className="sticky top-0 bg-white border-b z-10">
              <TabsList className="w-full justify-start rounded-none h-11 px-2">
                <TabsTrigger value="content" className="gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5" />
                  Content
                </TabsTrigger>
                <TabsTrigger value="design" className="gap-1.5 text-xs">
                  <Palette className="h-3.5 w-3.5" />
                  Design
                </TabsTrigger>
                <TabsTrigger value="form" className="gap-1.5 text-xs">
                  <Layout className="h-3.5 w-3.5" />
                  Form
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-1.5 text-xs">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </TabsTrigger>
                <TabsTrigger value="embed" className="gap-1.5 text-xs">
                  <Code className="h-3.5 w-3.5" />
                  Embed
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Content Tab */}
            <TabsContent value="content" className="p-4 space-y-5 mt-0">
              {/* Basic Info */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Page Info
                </Label>

                <div className="space-y-1.5">
                  <Label className="text-xs">Page Name (internal)</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="e.g., Main Booking Page"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Page URL</Label>
                  <div className="flex">
                    <span className="inline-flex items-center px-2.5 rounded-l-xl border border-r-0 bg-gray-50 text-xs text-gray-400">
                      /book/
                    </span>
                    <Input
                      value={formData.slug}
                      onChange={(e) =>
                        handleChange(
                          'slug',
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, '')
                        )
                      }
                      className="rounded-l-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Pricing Matrix</Label>
                  <Select
                    value={formData.pricingMatrixId}
                    onValueChange={(v) => handleChange('pricingMatrixId', v)}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Select pricing..." />
                    </SelectTrigger>
                    <SelectContent>
                      {pricingMatrices.map((matrix) => (
                        <SelectItem key={matrix.id} value={matrix.id}>
                          {matrix.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">Page Active</p>
                    <p className="text-[11px] text-gray-400">
                      Make publicly accessible
                    </p>
                  </div>
                  <Switch
                    checked={formData.active}
                    onCheckedChange={(v) => handleChange('active', v)}
                  />
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Header Content */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Header
                </Label>

                <div className="space-y-1.5">
                  <Label className="text-xs">Logo URL</Label>
                  <Input
                    value={formData.customization.logo}
                    onChange={(e) =>
                      handleChange('customization.logo', e.target.value)
                    }
                    placeholder="https://yoursite.com/logo.png"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Headline</Label>
                  <Input
                    value={formData.customization.headline}
                    onChange={(e) =>
                      handleChange('customization.headline', e.target.value)
                    }
                    placeholder="Book with Us"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Subheadline</Label>
                  <Input
                    value={formData.customization.subheadline}
                    onChange={(e) =>
                      handleChange('customization.subheadline', e.target.value)
                    }
                    placeholder="Get an instant quote..."
                  />
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Button & CTA */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Button & Thank You
                </Label>

                <div className="space-y-1.5">
                  <Label className="text-xs">Button Text</Label>
                  <Input
                    value={formData.customization.ctaText}
                    onChange={(e) =>
                      handleChange('customization.ctaText', e.target.value)
                    }
                    placeholder="Request Booking"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Thank You Title</Label>
                  <Input
                    value={formData.customization.thankYouTitle}
                    onChange={(e) =>
                      handleChange(
                        'customization.thankYouTitle',
                        e.target.value
                      )
                    }
                    placeholder="Booking Request Received!"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Thank You Message</Label>
                  <Textarea
                    value={formData.customization.thankYouMessage}
                    onChange={(e) =>
                      handleChange(
                        'customization.thankYouMessage',
                        e.target.value
                      )
                    }
                    placeholder="We'll contact you within 24 hours..."
                    rows={2}
                  />
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Social Proof */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Testimonial
                  </Label>
                  <Switch
                    checked={formData.customization.showTestimonial}
                    onCheckedChange={(v) =>
                      handleChange('customization.showTestimonial', v)
                    }
                  />
                </div>

                {formData.customization.showTestimonial && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Quote</Label>
                      <Textarea
                        value={formData.customization.testimonialText}
                        onChange={(e) =>
                          handleChange(
                            'customization.testimonialText',
                            e.target.value
                          )
                        }
                        placeholder="They did an amazing job..."
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Author</Label>
                      <Input
                        value={formData.customization.testimonialAuthor}
                        onChange={(e) =>
                          handleChange(
                            'customization.testimonialAuthor',
                            e.target.value
                          )
                        }
                        placeholder="Sarah J., Baltimore"
                      />
                    </div>
                  </>
                )}
              </div>
            </TabsContent>

            {/* Design Tab */}
            <TabsContent value="design" className="p-4 space-y-5 mt-0">
              {/* Colors */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Colors
                </Label>

                <div className="space-y-1.5">
                  <Label className="text-xs">Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={formData.customization.primaryColor}
                      onChange={(e) =>
                        handleChange(
                          'customization.primaryColor',
                          e.target.value
                        )
                      }
                      className="w-12 h-10 p-1 cursor-pointer rounded-xl"
                    />
                    <Input
                      value={formData.customization.primaryColor}
                      onChange={(e) =>
                        handleChange(
                          'customization.primaryColor',
                          e.target.value
                        )
                      }
                      className="flex-1 font-mono text-xs"
                    />
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color.value}
                        className={cn(
                          'w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110',
                          formData.customization.primaryColor === color.value
                            ? 'border-gray-900 scale-110'
                            : 'border-transparent'
                        )}
                        style={{ backgroundColor: color.value }}
                        onClick={() =>
                          handleChange('customization.primaryColor', color.value)
                        }
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Background Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={formData.customization.backgroundColor}
                      onChange={(e) =>
                        handleChange(
                          'customization.backgroundColor',
                          e.target.value
                        )
                      }
                      className="w-12 h-10 p-1 cursor-pointer rounded-xl"
                    />
                    <Input
                      value={formData.customization.backgroundColor}
                      onChange={(e) =>
                        handleChange(
                          'customization.backgroundColor',
                          e.target.value
                        )
                      }
                      className="flex-1 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Text Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={formData.customization.textColor}
                      onChange={(e) =>
                        handleChange(
                          'customization.textColor',
                          e.target.value
                        )
                      }
                      className="w-12 h-10 p-1 cursor-pointer rounded-xl"
                    />
                    <Input
                      value={formData.customization.textColor}
                      onChange={(e) =>
                        handleChange(
                          'customization.textColor',
                          e.target.value
                        )
                      }
                      className="flex-1 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Typography */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Typography
                </Label>

                <div className="space-y-1.5">
                  <Label className="text-xs">Font Family</Label>
                  <Select
                    value={formData.customization.fontFamily}
                    onValueChange={(v) =>
                      handleChange('customization.fontFamily', v)
                    }
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          <span style={{ fontFamily: font.value }}>
                            {font.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Spacing & Borders */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Styling
                </Label>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Border Radius</Label>
                    <span className="text-xs text-gray-400">
                      {formData.customization.borderRadius}px
                    </span>
                  </div>
                  <Slider
                    value={[formData.customization.borderRadius]}
                    onValueChange={([v]) =>
                      handleChange('customization.borderRadius', v)
                    }
                    min={0}
                    max={24}
                    step={2}
                  />
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Square</span>
                    <span>Rounded</span>
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Footer */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Footer
                </Label>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">
                      Show &ldquo;Powered by Vistrial&rdquo;
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Attribution in footer
                    </p>
                  </div>
                  <Switch
                    checked={formData.customization.showPoweredBy}
                    onCheckedChange={(v) =>
                      handleChange('customization.showPoweredBy', v)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Custom Footer Text</Label>
                  <Input
                    value={formData.customization.footerText}
                    onChange={(e) =>
                      handleChange('customization.footerText', e.target.value)
                    }
                    placeholder="© 2026 Your Business"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Form Tab */}
            <TabsContent value="form" className="p-4 space-y-5 mt-0">
              {/* Required Fields */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Required Fields
                </Label>

                <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200/80">
                  <div>
                    <p className="text-sm font-medium">Name</p>
                    <p className="text-[11px] text-gray-400">Always required</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    Required
                  </Badge>
                </div>

                {[
                  {
                    key: 'requirePhone',
                    label: 'Phone Number',
                    desc: 'For follow-up contact',
                  },
                  {
                    key: 'requireEmail',
                    label: 'Email Address',
                    desc: 'For confirmations',
                  },
                  {
                    key: 'requireAddress',
                    label: 'Service Address',
                    desc: 'Where service is needed',
                  },
                ].map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-200/80"
                  >
                    <div>
                      <p className="text-sm font-medium">{field.label}</p>
                      <p className="text-[11px] text-gray-400">{field.desc}</p>
                    </div>
                    <Switch
                      checked={
                        (formData.settings as any)[field.key]
                      }
                      onCheckedChange={(v) =>
                        handleChange(`settings.${field.key}`, v)
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="h-px bg-gray-100" />

              {/* Pricing Display */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Pricing Display
                </Label>

                {[
                  {
                    key: 'showPricing',
                    label: 'Show Pricing',
                    desc: 'Display prices as customer selects options',
                  },
                  {
                    key: 'showEstimate',
                    label: 'Show Estimate Label',
                    desc: 'Label prices as "estimates" vs final',
                  },
                ].map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-200/80"
                  >
                    <div>
                      <p className="text-sm font-medium">{field.label}</p>
                      <p className="text-[11px] text-gray-400">{field.desc}</p>
                    </div>
                    <Switch
                      checked={
                        (formData.settings as any)[field.key]
                      }
                      onCheckedChange={(v) =>
                        handleChange(`settings.${field.key}`, v)
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="h-px bg-gray-100" />

              {/* Scheduling */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Scheduling
                </Label>

                {[
                  {
                    key: 'allowDateSelection',
                    label: 'Allow Date Selection',
                    desc: 'Let customers pick preferred date',
                  },
                  {
                    key: 'allowTimeSelection',
                    label: 'Allow Time Selection',
                    desc: 'Let customers pick time of day',
                  },
                ].map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-200/80"
                  >
                    <div>
                      <p className="text-sm font-medium">{field.label}</p>
                      <p className="text-[11px] text-gray-400">{field.desc}</p>
                    </div>
                    <Switch
                      checked={
                        (formData.settings as any)[field.key]
                      }
                      onCheckedChange={(v) =>
                        handleChange(`settings.${field.key}`, v)
                      }
                    />
                  </div>
                ))}

                {formData.settings.allowDateSelection && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Minimum Lead Time (hours)
                      </Label>
                      <Input
                        type="number"
                        value={formData.settings.leadTime}
                        onChange={(e) =>
                          handleChange(
                            'settings.leadTime',
                            parseInt(e.target.value) || 0
                          )
                        }
                        min={0}
                      />
                      <p className="text-[11px] text-gray-400">
                        How far in advance must bookings be made
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Maximum Advance Booking (days)
                      </Label>
                      <Input
                        type="number"
                        value={formData.settings.maxAdvance}
                        onChange={(e) =>
                          handleChange(
                            'settings.maxAdvance',
                            parseInt(e.target.value) || 30
                          )
                        }
                        min={1}
                      />
                      <p className="text-[11px] text-gray-400">
                        How far in the future can customers book
                      </p>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="p-4 space-y-5 mt-0">
              {/* Notifications */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Notifications
                </Label>

                <div className="space-y-1.5">
                  <Label className="text-xs">Notification Email</Label>
                  <Input
                    type="email"
                    value={formData.settings.notificationEmail}
                    onChange={(e) =>
                      handleChange(
                        'settings.notificationEmail',
                        e.target.value
                      )
                    }
                    placeholder="you@example.com"
                  />
                  <p className="text-[11px] text-gray-400">
                    Where to send new booking alerts
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200/80">
                  <div>
                    <p className="text-sm font-medium">SMS Notifications</p>
                    <p className="text-[11px] text-gray-400">
                      Get SMS alerts for new bookings
                    </p>
                  </div>
                  <Switch
                    checked={formData.settings.notificationSms}
                    onCheckedChange={(v) =>
                      handleChange('settings.notificationSms', v)
                    }
                  />
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Confirmation */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Confirmation Message
                </Label>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Message shown after submission
                  </Label>
                  <Textarea
                    value={formData.settings.confirmationMessage}
                    onChange={(e) =>
                      handleChange(
                        'settings.confirmationMessage',
                        e.target.value
                      )
                    }
                    placeholder="Thanks! We'll be in touch..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* SEO */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  SEO Settings
                </Label>

                <div className="space-y-1.5">
                  <Label className="text-xs">Meta Title</Label>
                  <Input
                    value={formData.seo.metaTitle}
                    onChange={(e) =>
                      handleChange('seo.metaTitle', e.target.value)
                    }
                    placeholder={`Book with ${organization.name}`}
                  />
                  <p className="text-[11px] text-gray-400">
                    {formData.seo.metaTitle?.length || 0}/60 characters
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Meta Description</Label>
                  <Textarea
                    value={formData.seo.metaDescription}
                    onChange={(e) =>
                      handleChange('seo.metaDescription', e.target.value)
                    }
                    placeholder="Schedule your service online and get an instant quote..."
                    rows={2}
                  />
                  <p className="text-[11px] text-gray-400">
                    {formData.seo.metaDescription?.length || 0}/160 characters
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Social Share Image URL</Label>
                  <Input
                    value={formData.seo.ogImage}
                    onChange={(e) =>
                      handleChange('seo.ogImage', e.target.value)
                    }
                    placeholder="https://yoursite.com/og-image.png"
                  />
                  <p className="text-[11px] text-gray-400">
                    Recommended: 1200x630px
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Embed Tab */}
            <TabsContent value="embed" className="p-4 mt-0">
              <EmbedCodeGenerator
                bookingUrl={bookingUrl}
                slug={formData.slug}
                primaryColor={formData.customization.primaryColor}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Preview Panel */}
        {showPreview && (
          <div className="flex-1 bg-gray-100/50 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0">
              <div className="flex items-center gap-2">
                <Eye className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-500">
                  Preview
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => router.refresh()}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            </div>

            <div className="flex-1 overflow-auto p-4 flex justify-center">
              <div
                className={cn(
                  'bg-white rounded-2xl shadow-soft-lg overflow-hidden transition-all duration-300 border border-gray-200/60',
                  previewDevice === 'mobile'
                    ? 'w-[375px]'
                    : 'w-full max-w-3xl'
                )}
                style={{
                  minHeight:
                    previewDevice === 'mobile' ? '667px' : '500px',
                }}
              >
                <BookingPagePreview
                  customization={formData.customization}
                  settings={formData.settings}
                  pricingMatrix={pricingMatrices.find(
                    (p) => p.id === formData.pricingMatrixId
                  )}
                  organization={organization}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
