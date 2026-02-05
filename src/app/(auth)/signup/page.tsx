// ============================================
// SIGNUP PAGE
// ============================================

import { Metadata } from 'next';

export const dynamic = 'force-dynamic';
import { SignupForm } from '@/components/auth/signup-form';

export const metadata: Metadata = {
  title: 'Sign Up | Vistrial',
  description: 'Create your Vistrial account',
};

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-muted-foreground">Start reactivating your leads in minutes</p>
      </div>

      <div className="bg-card border rounded-lg p-6 shadow-sm">
        <SignupForm />
      </div>
    </div>
  );
}
