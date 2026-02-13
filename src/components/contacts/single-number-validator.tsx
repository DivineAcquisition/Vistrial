'use client';

// ============================================
// SINGLE NUMBER VALIDATION COMPONENT
// Quick inline validation for manual entry
// ============================================

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Smartphone,
  Phone,
  PhoneOff,
  Search,
} from 'lucide-react';

interface ValidationResult {
  phoneNumber: string;
  valid: boolean;
  canReceiveSMS: boolean;
  phoneType: 'mobile' | 'landline' | 'voip' | 'unknown';
  carrier: { name: string; type: string } | null;
  error?: string;
}

interface SingleNumberValidatorProps {
  onValidated?: (result: ValidationResult) => void;
  showInput?: boolean;
  phoneNumber?: string;
}

export function SingleNumberValidator({
  onValidated,
  showInput = true,
  phoneNumber: initialPhone = '',
}: SingleNumberValidatorProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-validate when used without input (e.g. embedded in a form)
  // Debounce by 800ms so we don't fire on every keystroke
  useEffect(() => {
    if (!showInput && initialPhone && initialPhone.length >= 10) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        validate(initialPhone);
      }, 800);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPhone, showInput]);

  const validate = async (numberToValidate?: string) => {
    const phoneToCheck = numberToValidate || phone;
    if (!phoneToCheck) return;

    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch(`/api/contacts/validate?phone=${encodeURIComponent(phoneToCheck)}`);
      const data: ValidationResult = await response.json();
      setResult(data);
      onValidated?.(data);
    } catch (error) {
      setResult({
        phoneNumber: phoneToCheck,
        valid: false,
        canReceiveSMS: false,
        phoneType: 'unknown',
        carrier: null,
        error: 'Validation failed',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getIcon = () => {
    if (!result) return null;
    if (!result.valid) return <XCircle className="h-4 w-4 text-red-500" />;
    switch (result.phoneType) {
      case 'mobile':
        return <Smartphone className="h-4 w-4 text-green-500" />;
      case 'voip':
        return <Phone className="h-4 w-4 text-blue-500" />;
      case 'landline':
        return <PhoneOff className="h-4 w-4 text-amber-500" />;
      default:
        return <Phone className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-2">
      {showInput && (
        <div className="flex gap-2">
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Enter phone number"
            className="flex-1"
          />
          <Button
            onClick={() => validate()}
            disabled={!phone || isLoading}
            size="icon"
            variant="outline"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}

      {result && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted text-sm">
          {getIcon()}
          <span className="font-mono">{result.phoneNumber}</span>
          <Badge
            variant={result.canReceiveSMS ? 'default' : 'destructive'}
            className="ml-auto"
          >
            {result.canReceiveSMS ? 'Can receive SMS' : 'Cannot receive SMS'}
          </Badge>
        </div>
      )}

      {result && result.carrier && (
        <p className="text-xs text-muted-foreground">
          Carrier: {result.carrier.name} ({result.carrier.type})
        </p>
      )}

      {result && result.error && (
        <p className="text-xs text-red-500">{result.error}</p>
      )}
    </div>
  );
}
