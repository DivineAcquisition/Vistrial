// ============================================
// SIGNUP PAGE
// ============================================

import { Metadata } from 'next';
import { SignupForm } from '@/components/auth/signup-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign Up | Vistrial',
  description: 'Create your Vistrial account',
};

export default function SignupPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Create your account
        </h1>
        <p className="text-sm text-gray-500">
          Start reactivating your leads in minutes
        </p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm shadow-gray-100/50">
        <SignupForm />
      </div>
    </div>
  );
}
