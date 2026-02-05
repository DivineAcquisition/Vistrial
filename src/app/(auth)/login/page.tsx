// ============================================
// LOGIN PAGE
// ============================================

import { Metadata } from 'next';

export const dynamic = 'force-dynamic';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Sign In | Vistrial',
  description: 'Sign in to your Vistrial account',
};

function LoginFormWrapper() {
  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground">Sign in to your account to continue</p>
      </div>

      <div className="bg-card border rounded-lg p-6 shadow-sm">
        <Suspense
          fallback={
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          }
        >
          <LoginFormWrapper />
        </Suspense>
      </div>
    </div>
  );
}
