// @ts-nocheck
'use client';

// ============================================
// ONBOARDING WIZARD - 4 Steps
// ============================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Building2,
  Phone,
  Users,
  Rocket,
  Check,
  ArrowRight,
  ArrowLeft,
  Upload,
  Search,
  Sparkles,
  MessageSquare,
  Calendar,
  Zap,
} from 'lucide-react';

const STEPS = [
  { id: 0, title: 'Business Info', icon: Building2, description: 'Tell us about your business' },
  { id: 1, title: 'Phone Number', icon: Phone, description: 'Get your SMS number' },
  { id: 2, title: 'Import Contacts', icon: Users, description: 'Add your customers' },
  { id: 3, title: 'Ready to Go', icon: Rocket, description: 'Start reactivating' },
];

const BUSINESS_TYPES = [
  { value: 'cleaning', label: 'Cleaning Service' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'painting', label: 'Painting' },
  { value: 'pest_control', label: 'Pest Control' },
  { value: 'general_contractor', label: 'General Contractor' },
  { value: 'moving', label: 'Moving Service' },
  { value: 'carpet_cleaning', label: 'Carpet Cleaning' },
  { value: 'window_cleaning', label: 'Window Cleaning' },
  { value: 'pressure_washing', label: 'Pressure Washing' },
  { value: 'pool_service', label: 'Pool Service' },
  { value: 'appliance_repair', label: 'Appliance Repair' },
  { value: 'locksmith', label: 'Locksmith' },
  { value: 'garage_door', label: 'Garage Door Service' },
  { value: 'other', label: 'Other Home Service' },
];

interface OnboardingWizardProps {
  organization: any;
  user: any;
  currentStep: number;
}

export function OnboardingWizard({
  organization,
  user,
  currentStep,
}: OnboardingWizardProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(currentStep);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Step 1: Business Info
  const [businessInfo, setBusinessInfo] = useState({
    businessType: organization?.business_type || '',
    phone: organization?.phone || '',
    serviceArea: organization?.service_area || '',
  });

  // Step 2: Phone Number
  const [phoneSetup, setPhoneSetup] = useState({
    areaCode: '',
    selectedNumber: organization?.telnyx_phone_number || '',
    availableNumbers: [] as any[],
    isSearching: false,
    isPurchasing: false,
  });

  // Step 3: Contacts
  const [contactsImported, setContactsImported] = useState(false);
  const [contactCount, setContactCount] = useState(0);

  const progress = ((step + 1) / STEPS.length) * 100;

  // Check for existing contacts
  useEffect(() => {
    const checkContacts = async () => {
      try {
        const response = await fetch('/api/contacts?limit=1');
        const data = await response.json();
        if (data.total > 0) {
          setContactsImported(true);
          setContactCount(data.total);
        }
      } catch (error) {
        console.error('Error checking contacts:', error);
      }
    };
    checkContacts();
  }, []);

  const saveStep = async (nextStep: number) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/onboarding/save-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step,
          data: step === 0 ? businessInfo : step === 1 ? { selectedNumber: phoneSetup.selectedNumber } : {},
        }),
      });

      if (!response.ok) throw new Error('Failed to save');

      if (nextStep >= STEPS.length) {
        await fetch('/api/onboarding/complete', { method: 'POST' });
        toast({ title: 'Setup complete!', description: 'Welcome to Vistrial!' });
        router.push('/dashboard');
      } else {
        setStep(nextStep);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const searchPhoneNumbers = async () => {
    if (!phoneSetup.areaCode || phoneSetup.areaCode.length !== 3) {
      toast({ title: 'Please enter a 3-digit area code', variant: 'destructive' });
      return;
    }

    setPhoneSetup((prev) => ({ ...prev, isSearching: true, availableNumbers: [] }));

    try {
      const response = await fetch(
        `/api/telnyx/search-numbers?areaCode=${phoneSetup.areaCode}`
      );
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.numbers?.length > 0) {
        setPhoneSetup((prev) => ({
          ...prev,
          availableNumbers: data.numbers,
          isSearching: false,
        }));
      } else {
        toast({
          title: 'No numbers available',
          description: 'Try a different area code',
          variant: 'destructive',
        });
        setPhoneSetup((prev) => ({ ...prev, isSearching: false }));
      }
    } catch (error) {
      toast({
        title: 'Search failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
      setPhoneSetup((prev) => ({ ...prev, isSearching: false }));
    }
  };

  const purchaseNumber = async (phoneNumber: string) => {
    setPhoneSetup((prev) => ({ ...prev, isPurchasing: true }));

    try {
      const response = await fetch('/api/telnyx/purchase-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to purchase');
      }

      setPhoneSetup((prev) => ({
        ...prev,
        selectedNumber: phoneNumber,
        isPurchasing: false,
      }));

      toast({ title: 'Phone number activated!', description: phoneNumber });
    } catch (error) {
      toast({
        title: 'Failed to purchase number',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
      setPhoneSetup((prev) => ({ ...prev, isPurchasing: false }));
    }
  };

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  const canProceed = () => {
    switch (step) {
      case 0:
        return businessInfo.businessType && businessInfo.serviceArea;
      case 1:
        return true;
      case 2:
        return true;
      case 3:
        return true;
      default:
        return true;
    }
  };

  return (
    <div className="space-y-8">
      {/* Progress Header */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">Let&apos;s Get You Set Up</h1>
        <p className="text-muted-foreground">{STEPS[step].description}</p>
        <Progress value={progress} className="h-2 max-w-md mx-auto" />

        {/* Step Indicators */}
        <div className="flex justify-center gap-2 pt-2">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                i < step
                  ? 'bg-primary/20 text-primary'
                  : i === step
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < step ? <Check className="h-3 w-3" /> : <s.icon className="h-3 w-3" />}
              <span className="hidden sm:inline">{s.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card className="max-w-2xl mx-auto">
        {/* Step 0: Business Info */}
        {step === 0 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Tell us about your business
              </CardTitle>
              <CardDescription>
                This helps us customize your experience and message templates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="businessType">What type of business do you run? *</Label>
                <Select
                  value={businessInfo.businessType}
                  onValueChange={(value) =>
                    setBusinessInfo((prev) => ({ ...prev, businessType: value }))
                  }
                >
                  <SelectTrigger id="businessType">
                    <SelectValue placeholder="Select your industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Business Phone (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={businessInfo.phone}
                  onChange={(e) =>
                    setBusinessInfo((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  placeholder="+1 (555) 000-0000"
                />
                <p className="text-xs text-muted-foreground">
                  Customers will see this number on booking pages
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="serviceArea">Service Area *</Label>
                <Input
                  id="serviceArea"
                  value={businessInfo.serviceArea}
                  onChange={(e) =>
                    setBusinessInfo((prev) => ({ ...prev, serviceArea: e.target.value }))
                  }
                  placeholder="e.g., Baltimore Metro Area, Montgomery County MD"
                />
                <p className="text-xs text-muted-foreground">
                  Where do you provide services?
                </p>
              </div>
            </CardContent>
          </>
        )}

        {/* Step 1: Phone Number */}
        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary" />
                Get Your SMS Phone Number
              </CardTitle>
              <CardDescription>
                This dedicated number will be used to send and receive SMS messages with your customers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!phoneSetup.selectedNumber ? (
                <>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="areaCode">Search by Area Code</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">+1</span>
                          <Input
                            id="areaCode"
                            value={phoneSetup.areaCode}
                            onChange={(e) =>
                              setPhoneSetup((prev) => ({
                                ...prev,
                                areaCode: e.target.value.replace(/\D/g, '').slice(0, 3),
                              }))
                            }
                            placeholder="410"
                            maxLength={3}
                            className="pl-10"
                          />
                        </div>
                        <Button
                          onClick={searchPhoneNumbers}
                          disabled={phoneSetup.isSearching || phoneSetup.areaCode.length !== 3}
                        >
                          {phoneSetup.isSearching ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4 mr-2" />
                          )}
                          Search
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Enter your local area code for a number customers will recognize
                      </p>
                    </div>

                    {phoneSetup.availableNumbers.length > 0 && (
                      <div className="space-y-2">
                        <Label>Available Numbers</Label>
                        <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                          {phoneSetup.availableNumbers.slice(0, 8).map((num) => (
                            <Button
                              key={num.phone_number}
                              variant="outline"
                              className="justify-between h-auto py-3"
                              onClick={() => purchaseNumber(num.phone_number)}
                              disabled={phoneSetup.isPurchasing}
                            >
                              <span className="font-mono text-base">
                                {formatPhoneNumber(num.phone_number)}
                              </span>
                              {phoneSetup.isPurchasing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <span className="text-xs text-muted-foreground">Select</span>
                              )}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Don&apos;t have a preference?{' '}
                      <Button
                        variant="link"
                        className="px-1 h-auto"
                        onClick={() => saveStep(step + 1)}
                      >
                        Skip for now
                      </Button>
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400">
                    <Check className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">Phone Number Activated!</p>
                    <p className="text-2xl font-mono mt-2">
                      {formatPhoneNumber(phoneSetup.selectedNumber)}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This number is ready to send and receive SMS messages
                  </p>
                </div>
              )}
            </CardContent>
          </>
        )}

        {/* Step 2: Import Contacts */}
        {step === 2 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Import Your Customers
              </CardTitle>
              <CardDescription>Upload your customer list to start reactivating them</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!contactsImported ? (
                <>
                  <div
                    className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => router.push('/contacts?upload=true')}
                  >
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="font-medium mb-2">Upload a CSV file</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Include columns: name, phone, email (optional), last service date (optional)
                    </p>
                    <Button>
                      <Upload className="h-4 w-4 mr-2" />
                      Choose File
                    </Button>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or import from</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {['Jobber', 'Housecall Pro', 'ServiceTitan'].map((name) => (
                      <Button key={name} variant="outline" className="h-auto py-3" disabled>
                        <div className="text-center">
                          <span className="block font-medium">{name}</span>
                          <span className="text-xs text-muted-foreground">Coming soon</span>
                        </div>
                      </Button>
                    ))}
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Want to add contacts manually later?{' '}
                      <Button variant="link" className="px-1 h-auto" onClick={() => saveStep(step + 1)}>
                        Skip for now
                      </Button>
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400">
                    <Check className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">Contacts Imported!</p>
                    <p className="text-3xl font-bold mt-2">{contactCount}</p>
                    <p className="text-muted-foreground">customers ready to reactivate</p>
                  </div>
                </div>
              )}
            </CardContent>
          </>
        )}

        {/* Step 3: Complete */}
        {step === 3 && (
          <>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4">
                <Sparkles className="h-12 w-12 text-primary" />
              </div>
              <CardTitle className="text-2xl">You&apos;re All Set!</CardTitle>
              <CardDescription>Your account is ready. Here&apos;s what you can do next:</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                {[
                  { icon: Zap, title: 'Create Your First Campaign', desc: 'Build a reactivation workflow to bring back past customers', href: '/workflows/new' },
                  { icon: Users, title: 'Manage Contacts', desc: 'Import more customers or add them manually', href: '/contacts' },
                  { icon: Calendar, title: 'Create Booking Page', desc: 'Let customers book appointments directly', href: '/booking/new' },
                  { icon: MessageSquare, title: 'Configure Messaging', desc: 'Set up your SMS number and messaging preferences', href: '/settings/messaging' },
                ].map((item) => (
                  <div
                    key={item.href}
                    className="flex items-start gap-4 p-4 border rounded-lg hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => router.push(item.href)}
                  >
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <item.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </CardContent>
          </>
        )}

        {/* Navigation */}
        <div className="flex justify-between p-6 pt-0 border-t mt-6">
          <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 0 || isSaving}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <Button onClick={() => saveStep(step + 1)} disabled={!canProceed() || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {step === STEPS.length - 1 ? 'Go to Dashboard' : 'Continue'}
            {step < STEPS.length - 1 && <ArrowRight className="h-4 w-4 ml-2" />}
          </Button>
        </div>
      </Card>
    </div>
  );
}
