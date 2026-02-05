'use client';

// ============================================
// FORGOT PASSWORD FORM COMPONENT
// ============================================

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from './auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { error: resetError } = await resetPassword(email);

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="h-6 w-6 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold">Check your email</h3>
        <p className="text-muted-foreground">
          We&apos;ve sent a password reset link to <strong>{email}</strong>
        </p>
        <Link href="/login">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to login
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">Forgot your password?</h3>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10"
            required
            disabled={isLoading}
            autoComplete="email"
          />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          'Send reset link'
        )}
      </Button>

      <Link href="/login" className="block text-center">
        <Button variant="ghost" className="text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to login
        </Button>
      </Link>
    </form>
  );
}
