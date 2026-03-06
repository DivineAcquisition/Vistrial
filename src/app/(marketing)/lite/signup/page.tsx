// ============================================
// LITE SIGNUP PAGE
// Self-serve signup for Vistrial Lite
// ============================================

import { Metadata } from 'next';
import { LiteSignupForm } from '@/components/lite/lite-signup-form';

export const metadata: Metadata = {
  title: 'Start Your Free Trial',
};

export default function LiteSignupPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 bg-gray-50">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Start your free trial</h1>
          <p className="text-gray-600">
            7 days free. No credit card required.
          </p>
        </div>

        <LiteSignupForm />

        <p className="text-center text-xs text-gray-500 mt-6">
          By signing up, you agree to our{' '}
          <a href="/terms" className="underline hover:text-brand-600">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacy" className="underline hover:text-brand-600">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
