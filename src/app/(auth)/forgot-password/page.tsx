// ============================================
// FORGOT PASSWORD PAGE
// ============================================

import { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reset Password | Vistrial',
  description: 'Reset your Vistrial password',
};

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Reset password
        </h1>
        <p className="text-sm text-gray-500">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm shadow-gray-100/50">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
