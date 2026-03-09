// @ts-nocheck
'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  RiMailLine,
  RiLockPasswordLine,
  RiUserLine,
  RiBuildingLine,
  RiPhoneLine,
  RiArrowRightLine,
  RiArrowLeftLine,
  RiErrorWarningLine,
  RiLoader4Line,
  RiCheckLine,
  RiGoogleFill,
  RiShieldCheckLine,
} from '@remixicon/react';
import { createClient } from '@/lib/supabase/client';

type SignupStep = 'info' | 'verify' | 'google-info';

export default function SignupPage() {
  const [step, setStep] = useState<SignupStep>('info');
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    phone: '',
  });
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      const { data, error: signupError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            business_name: formData.businessName,
            phone: formData.phone,
          },
        },
      });

      if (signupError) {
        setError(signupError.message);
        return;
      }

      if (data?.session) {
        await createOrgAndRedirect(data.user?.id);
        return;
      }

      setStep('verify');
      setResendCountdown(60);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const supabase = createClient();

      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: formData.email,
        token: code,
        type: 'signup',
      });

      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      if (data?.user) {
        await createOrgAndRedirect(data.user.id);
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendCountdown > 0) return;
    setError('');

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: formData.email,
      });
      if (error) {
        setError(error.message);
        return;
      }
      setResendCountdown(60);
      setOtpDigits(['', '', '', '', '', '']);
    } catch {
      setError('Failed to resend code');
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);
    setError('');

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    if (newDigits.every((d) => d !== '') && newDigits.join('').length === 6) {
      setTimeout(() => handleVerifyOTP(), 100);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newDigits = [...otpDigits];
    for (let i = 0; i < pasted.length && i < 6; i++) {
      newDigits[i] = pasted[i];
    }
    setOtpDigits(newDigits);
    const focusIndex = Math.min(pasted.length, 5);
    otpRefs.current[focusIndex]?.focus();
  };

  const createOrgAndRedirect = async (userId?: string) => {
    if (!userId) {
      window.location.href = '/onboarding';
      return;
    }

    try {
      await fetch('/api/auth/setup-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.businessName,
          business_type: 'other',
          user_id: userId,
          first_name: formData.fullName.split(' ')[0],
          last_name: formData.fullName.split(' ').slice(1).join(' '),
          phone: formData.phone,
        }),
      });
    } catch (err) {
      console.error('Org creation error (will retry in callback):', err);
    }

    window.location.href = '/onboarding';
  };

  const handleGoogleSignIn = async () => {
    if (!formData.businessName || !formData.phone) {
      setStep('google-info');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const supabase = createClient();

      localStorage.setItem(
        'vistrial_signup_data',
        JSON.stringify({
          business_name: formData.businessName,
          phone: formData.phone,
          full_name: formData.fullName,
        })
      );

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
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
    } finally {
      setIsLoading(false);
    }
  };

  // ══════════════════════════════════════════
  // STEP: Verify OTP
  // ══════════════════════════════════════════
  if (step === 'verify') {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 mb-2">
            <RiShieldCheckLine className="h-7 w-7 text-brand-600" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Verify your email
          </h1>
          <p className="text-gray-500 text-sm">
            We sent a 6-digit code to <strong className="text-gray-700">{formData.email}</strong>
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            <RiErrorWarningLine className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
          {otpDigits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { otpRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpChange(i, e.target.value)}
              onKeyDown={(e) => handleOtpKeyDown(i, e)}
              className="h-14 w-12 rounded-xl border-2 border-gray-200 text-center text-2xl font-bold text-gray-900 transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              autoFocus={i === 0}
            />
          ))}
        </div>

        <Button
          onClick={handleVerifyOTP}
          className="w-full"
          size="lg"
          disabled={isVerifying || otpDigits.join('').length !== 6}
        >
          {isVerifying ? (
            <>
              <RiLoader4Line className="mr-2 h-4 w-4 animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              Verify &amp; continue
              <RiArrowRightLine className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        <div className="text-center text-sm text-gray-500">
          Didn&apos;t receive the code?{' '}
          {resendCountdown > 0 ? (
            <span className="text-gray-400">Resend in {resendCountdown}s</span>
          ) : (
            <button onClick={handleResendOTP} className="font-semibold text-brand-600 hover:text-brand-700">
              Resend code
            </button>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center space-y-2">
          <p className="text-xs text-gray-500">
            If you received an email link instead of a code, click the link to verify,
            then <Link href="/login" className="text-brand-600 font-semibold hover:underline">sign in here</Link>.
          </p>
        </div>

        <button
          onClick={() => { setStep('info'); setError(''); }}
          className="flex items-center justify-center gap-1 w-full text-sm text-gray-500 hover:text-gray-700"
        >
          <RiArrowLeftLine className="h-3 w-3" />
          Back to signup
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // STEP: Google OAuth — collect business info
  // ══════════════════════════════════════════
  if (step === 'google-info') {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 mb-2">
            <RiGoogleFill className="h-7 w-7 text-brand-600" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Almost there
          </h1>
          <p className="text-gray-500 text-sm">
            We just need a couple more details before signing in with Google
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            <RiErrorWarningLine className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="googleBusinessName" className="text-gray-700">Business name</Label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <RiBuildingLine className="h-5 w-5 text-gray-400" />
              </div>
              <Input
                id="googleBusinessName"
                value={formData.businessName}
                onChange={(e) => setFormData((prev) => ({ ...prev, businessName: e.target.value }))}
                placeholder="Acme Services"
                required
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="googlePhone" className="text-gray-700">Business phone</Label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <RiPhoneLine className="h-5 w-5 text-gray-400" />
              </div>
              <Input
                id="googlePhone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="(555) 123-4567"
                required
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <Button
          onClick={handleGoogleSignIn}
          className="w-full"
          size="lg"
          disabled={!formData.businessName || !formData.phone || isLoading}
        >
          {isLoading ? (
            <RiLoader4Line className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RiGoogleFill className="mr-2 h-5 w-5" />
          )}
          Continue with Google
        </Button>

        <button
          onClick={() => { setStep('info'); setError(''); }}
          className="flex items-center justify-center gap-1 w-full text-sm text-gray-500 hover:text-gray-700"
        >
          <RiArrowLeftLine className="h-3 w-3" />
          Back to signup
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // STEP: Info (main signup form)
  // ══════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Automate your service business
        </h1>
        <p className="text-gray-500">
          Set up your account in 2 minutes. No credit card required.
        </p>
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
        {/* Full Name */}
        <div className="space-y-2">
          <Label htmlFor="fullName" className="text-gray-700">Full name</Label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <RiUserLine className="h-5 w-5 text-gray-400" />
            </div>
            <Input id="fullName" name="fullName" placeholder="John Smith" value={formData.fullName} onChange={handleChange} required className="pl-10" />
          </div>
        </div>

        {/* Business Name */}
        <div className="space-y-2">
          <Label htmlFor="businessName" className="text-gray-700">Business name</Label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <RiBuildingLine className="h-5 w-5 text-gray-400" />
            </div>
            <Input id="businessName" name="businessName" placeholder="Acme Services" value={formData.businessName} onChange={handleChange} required className="pl-10" />
          </div>
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-gray-700">Email</Label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <RiMailLine className="h-5 w-5 text-gray-400" />
            </div>
            <Input id="email" name="email" type="email" placeholder="you@company.com" value={formData.email} onChange={handleChange} required className="pl-10" />
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-gray-700">Business phone</Label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <RiPhoneLine className="h-5 w-5 text-gray-400" />
            </div>
            <Input id="phone" name="phone" type="tel" placeholder="(555) 123-4567" value={formData.phone} onChange={handleChange} required className="pl-10" />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password" className="text-gray-700">Password</Label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <RiLockPasswordLine className="h-5 w-5 text-gray-400" />
            </div>
            <Input id="password" name="password" type="password" placeholder="Create a strong password" value={formData.password} onChange={handleChange} required minLength={8} className="pl-10" />
          </div>
          <p className="text-xs text-gray-500">Minimum 8 characters</p>
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-gray-700">Confirm password</Label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <RiLockPasswordLine className="h-5 w-5 text-gray-400" />
            </div>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              minLength={8}
              className="pl-10"
            />
          </div>
          {formData.confirmPassword && formData.password !== formData.confirmPassword && (
            <p className="text-xs text-red-500">Passwords do not match</p>
          )}
        </div>

        {/* Submit */}
        <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
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

      {/* Google OAuth */}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        size="lg"
        disabled={isLoading}
        onClick={handleGoogleSignIn}
      >
        <RiGoogleFill className="mr-2 h-5 w-5 text-gray-600" />
        Continue with Google
      </Button>

      {/* Social proof */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
        <p className="text-sm text-gray-600 font-medium">
          Trusted by service businesses to automate follow-ups and grow revenue
        </p>
      </div>

      {/* Terms */}
      <p className="text-center text-xs text-gray-500">
        By signing up, you agree to our{' '}
        <Link href="/terms" className="text-brand-600 hover:underline">Terms of Service</Link>
        {' '}and{' '}
        <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>
      </p>

      {/* Sign in link */}
      <p className="text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
