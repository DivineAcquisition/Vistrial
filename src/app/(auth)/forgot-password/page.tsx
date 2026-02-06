// ============================================
// FORGOT PASSWORD PAGE
// ============================================

import { Metadata } from 'next';

export const dynamic = 'force-dynamic';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset Password | Vistrial',
  description: 'Reset your Vistrial password',
};

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="bg-card border rounded-lg p-6 shadow-sm">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
