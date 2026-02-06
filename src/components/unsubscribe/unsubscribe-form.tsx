'use client';

// ============================================
// UNSUBSCRIBE FORM
// ============================================

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RiCheckLine, RiLoader4Line, RiMailLine, RiMailCloseLine } from '@remixicon/react';

interface UnsubscribeFormProps {
  contactId?: string;
  organizationId?: string;
}

export function UnsubscribeForm({
  contactId,
  organizationId,
}: UnsubscribeFormProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleUnsubscribe = async () => {
    if (!contactId || !organizationId) {
      setError('Invalid unsubscribe link');
      setStatus('error');
      return;
    }

    setStatus('loading');

    try {
      const response = await fetch('/api/contacts/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, organizationId }),
      });

      if (!response.ok) {
        throw new Error('Failed to unsubscribe');
      }

      setStatus('success');
    } catch {
      setError('Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <RiCheckLine className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold mb-2">You&apos;ve been unsubscribed</h2>
          <p className="text-muted-foreground">
            You won&apos;t receive any more emails from this business.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md w-full">
      <CardHeader className="text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <RiMailCloseLine className="h-8 w-8 text-muted-foreground" />
        </div>
        <CardTitle>Unsubscribe from emails</CardTitle>
        <CardDescription>
          Click below to stop receiving emails from this business.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <Button
          onClick={handleUnsubscribe}
          disabled={status === 'loading'}
          className="w-full"
          variant="destructive"
        >
          {status === 'loading' ? (
            <>
              <RiLoader4Line className="mr-2 h-4 w-4 animate-spin" />
              Unsubscribing...
            </>
          ) : (
            'Unsubscribe'
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center mt-4">
          This will only unsubscribe you from this specific business.
        </p>
      </CardContent>
    </Card>
  );
}
