// ============================================
// LOGIN PAGE
// ============================================

'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  RiMailLine,
  RiLockPasswordLine,
  RiArrowRightLine,
  RiCheckLine,
  RiErrorWarningLine,
  RiLoader4Line,
  RiGoogleFill,
} from '@remixicon/react';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const message = searchParams.get('message');
  const urlError = searchParams.get('error');
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setError('Invalid email or password.');
        } else if (error.message.includes('Email not confirmed')) {
          setError('Please verify your email first.');
        } else {
          setError(error.message);
        }
        setIsLoading(false);
        return;
      }

      // Verify we actually got a session
      if (!data?.session) {
        setError('Sign in succeeded but no session was created. Please try again.');
        setIsLoading(false);
        return;
      }

      // Hard navigation so middleware sees the session cookie
      window.location.href = redirectTo;
    } catch {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsGoogleLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message || 'Google sign-in failed.');
        setIsGoogleLoading(false);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch {
      setError('Failed to connect to Google.');
      setIsGoogleLoading(false);
    }
  };

  const anyLoading = isLoading || isGoogleLoading;

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Welcome back</h1>
        <p className="text-gray-500">Sign in to your account to continue</p>
      </div>

      {message && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-700 animate-slide-in-from-top">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
            <RiCheckLine className="h-4 w-4" />
          </div>
          <span className="text-sm">{message}</span>
        </div>
      )}

      {(error || urlError) && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 animate-slide-in-from-top">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
            <RiErrorWarningLine className="h-4 w-4" />
          </div>
          <span className="text-sm">{error || urlError}</span>
        </div>
      )}

      {/* Google */}
      <Button
        type="button"
        variant="outline"
        className="w-full transition-all duration-200 hover:scale-[1.02]"
        size="lg"
        onClick={handleGoogleSignIn}
        disabled={anyLoading}
      >
        {isGoogleLoading ? (
          <RiLoader4Line className="mr-2 h-5 w-5 animate-spin" />
        ) : (
          <RiGoogleFill className="mr-2 h-5 w-5 text-gray-600" />
        )}
        Continue with Google
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-gray-500">or continue with email</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-gray-700">Email</Label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <RiMailLine className="h-5 w-5 text-gray-400" />
            </div>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={anyLoading}
              className="pl-10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-gray-700">Password</Label>
            <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <RiLockPasswordLine className="h-5 w-5 text-gray-400" />
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={anyLoading}
              className="pl-10"
            />
          </div>
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={anyLoading}>
          {isLoading ? (
            <>
              <RiLoader4Line className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              Sign in
              <RiArrowRightLine className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-semibold text-brand-600 hover:text-brand-700">
          Start free trial
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16">
        <RiLoader4Line className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
