// ============================================
// SIGNUP PAGE
// User registration page with animations
// ============================================

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  RiMailLine,
  RiLockPasswordLine,
  RiUserLine,
  RiBuildingLine,
  RiArrowRightLine,
  RiErrorWarningLine,
  RiLoader4Line,
  RiCheckLine,
  RiGoogleFill,
} from '@remixicon/react';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    businessName: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            business_name: formData.businessName,
          },
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      // If session exists, Supabase auto-confirmed the user (email confirm disabled)
      // → Create org immediately and go to onboarding
      if (data?.session) {
        try {
          await fetch('/api/auth/setup-organization', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: formData.businessName,
              business_type: 'other',
              user_id: data.user?.id,
              first_name: formData.fullName.split(' ')[0],
              last_name: formData.fullName.split(' ').slice(1).join(' '),
            }),
          });
        } catch (orgError) {
          console.error('Failed to create org during signup:', orgError);
          // Don't block — ensureOrganization in auth callback will retry
        }
        window.location.href = '/onboarding';
        return;
      }

      // Email confirmation required → send to login with message
      window.location.href = '/login?message=Check your email to confirm your account';
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const benefits = [
    '14-day free trial',
    'No credit card required',
    'Unlimited campaigns',
    'Cancel anytime',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Start your free trial
        </h1>
        <p className="text-gray-500">
          No credit card required. Start reactivating customers today.
        </p>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-2 gap-2">
        {benefits.map((benefit, index) => (
          <div
            key={benefit}
            className="flex items-center gap-2 text-sm text-gray-600 animate-fade-in"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100">
              <RiCheckLine className="h-3 w-3 text-green-600" />
            </div>
            {benefit}
          </div>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 animate-slide-in-from-top">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
            <RiErrorWarningLine className="h-4 w-4" />
          </div>
          <span className="text-sm">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full Name Field */}
        <div className="space-y-2">
          <Label htmlFor="fullName" className="text-gray-700">Full name</Label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <RiUserLine className="h-5 w-5 text-gray-400" />
            </div>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="John Smith"
              value={formData.fullName}
              onChange={handleChange}
              required
              className="pl-10 transition-all duration-200 focus:scale-[1.01]"
            />
          </div>
        </div>

        {/* Business Name Field */}
        <div className="space-y-2">
          <Label htmlFor="businessName" className="text-gray-700">Business name</Label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <RiBuildingLine className="h-5 w-5 text-gray-400" />
            </div>
            <Input
              id="businessName"
              name="businessName"
              type="text"
              placeholder="Smith Cleaning Services"
              value={formData.businessName}
              onChange={handleChange}
              required
              className="pl-10 transition-all duration-200 focus:scale-[1.01]"
            />
          </div>
        </div>

        {/* Email Field */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-gray-700">Work email</Label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <RiMailLine className="h-5 w-5 text-gray-400" />
            </div>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com"
              value={formData.email}
              onChange={handleChange}
              required
              className="pl-10 transition-all duration-200 focus:scale-[1.01]"
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <Label htmlFor="password" className="text-gray-700">Password</Label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <RiLockPasswordLine className="h-5 w-5 text-gray-400" />
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Create a strong password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={8}
              className="pl-10 transition-all duration-200 focus:scale-[1.01]"
            />
          </div>
          <p className="text-xs text-gray-500">Minimum 8 characters</p>
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          size="lg"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <RiLoader4Line className="mr-2 h-4 w-4 animate-spin" />
              Creating account...
            </>
          ) : (
            <>
              Start free trial
              <RiArrowRightLine className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-gray-500">or continue with</span>
        </div>
      </div>

      {/* Social Login */}
      <Button
        type="button"
        variant="outline"
        className="w-full transition-all duration-200 hover:scale-[1.02]"
        size="lg"
        disabled={isLoading}
        onClick={async () => {
          try {
            const supabase = createClient();
            const { data, error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: `${window.location.origin}/auth/callback`,
              },
            });
            if (error) {
              setError(error.message);
              return;
            }
            if (data?.url) {
              window.location.href = data.url;
            }
          } catch {
            setError('Failed to connect to Google.');
          }
        }}
      >
        <RiGoogleFill className="mr-2 h-5 w-5 text-gray-600" />
        Continue with Google
      </Button>

      {/* Terms */}
      <p className="text-center text-xs text-gray-500">
        By signing up, you agree to our{' '}
        <Link href="/terms" className="text-brand-600 hover:underline">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="text-brand-600 hover:underline">
          Privacy Policy
        </Link>
      </p>

      {/* Sign in link */}
      <p className="text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link 
          href="/login" 
          className="font-semibold text-brand-600 transition-colors hover:text-brand-700"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
