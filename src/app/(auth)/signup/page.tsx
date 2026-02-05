// ============================================
// SIGNUP PAGE
// User registration page
// ============================================

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Loader2, CheckCircle } from 'lucide-react';
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

      const { error } = await supabase.auth.signUp({
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

      router.push('/login?message=Check your email to confirm your account');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="shadow-xl border-gray-200">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl text-gray-900">Start your free trial</CardTitle>
        <CardDescription>No credit card required. Start reactivating customers today.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Error Message */}
        {error && (
          <div className="mb-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-200">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="John Smith"
              value={formData.fullName}
              onChange={handleChange}
              required
              className="border-gray-300 focus:border-brand-600 focus:ring-brand-600"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="businessName">Business name</Label>
            <Input
              id="businessName"
              name="businessName"
              type="text"
              placeholder="Smith Cleaning Services"
              value={formData.businessName}
              onChange={handleChange}
              required
              className="border-gray-300 focus:border-brand-600 focus:ring-brand-600"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com"
              value={formData.email}
              onChange={handleChange}
              required
              className="border-gray-300 focus:border-brand-600 focus:ring-brand-600"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Create a strong password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={8}
              className="border-gray-300 focus:border-brand-600 focus:ring-brand-600"
            />
            <p className="text-xs text-gray-500">Minimum 8 characters</p>
          </div>

          <Button
            type="submit"
            className="w-full bg-brand-600 hover:bg-brand-700"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              'Start free trial'
            )}
          </Button>
        </form>

        <p className="mt-4 text-xs text-gray-500 text-center">
          By signing up, you agree to our{' '}
          <Link href="/terms" className="text-brand-600 hover:underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-brand-600 hover:underline">
            Privacy Policy
          </Link>
        </p>

        <div className="mt-6 text-center text-sm">
          <span className="text-gray-600">Already have an account?</span>{' '}
          <Link href="/login" className="text-brand-600 hover:text-brand-700 font-medium">
            Sign in
          </Link>
        </div>

        {/* Benefits */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm font-medium text-gray-900 mb-3">What&apos;s included:</p>
          <ul className="space-y-2">
            {[
              '14-day free trial',
              'Unlimited campaigns',
              'SMS & voice messaging',
              'No credit card required',
            ].map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="h-4 w-4 text-green-600" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
