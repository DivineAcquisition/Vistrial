"use client";

import { useState, useEffect } from "react";
import { RiLoader4Line, RiCheckboxCircleLine, RiErrorWarningLine, RiRefreshLine } from "@remixicon/react";

interface DebugStatus {
  timestamp: string;
  environment: {
    hasSupabaseUrl: boolean;
    hasSupabaseAnonKey: boolean;
    hasServiceRoleKey: boolean;
  };
  auth: {
    authenticated: boolean;
    userId: string;
    email: string;
  } | null;
  business: {
    exists: boolean;
    data: any;
  } | null;
  errors: string[];
}

export default function FixOnboardingPage() {
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [status, setStatus] = useState<DebugStatus | null>(null);
  const [fixResult, setFixResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/debug/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setErrorMsg("Failed to check status");
    } finally {
      setLoading(false);
    }
  };

  const fixOnboarding = async () => {
    setFixing(true);
    setErrorMsg("");
    setFixResult(null);
    try {
      const res = await fetch("/api/onboarding/force-complete");
      const data = await res.json();
      setFixResult(data);
      
      if (data.success && data.redirectTo) {
        setTimeout(() => {
          window.location.href = data.redirectTo;
        }, 2000);
      }
    } catch {
      setErrorMsg("Failed to fix onboarding");
    } finally {
      setFixing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Onboarding Diagnostic</h1>
        <p className="text-gray-500 mb-8">Check and fix your onboarding status</p>

        {loading ? (
          <div className="bg-white rounded-xl border p-8 text-center">
            <RiLoader4Line className="w-8 h-8 animate-spin text-brand-600 mx-auto mb-4" />
            <p className="text-gray-500">Checking status...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Environment Status */}
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Environment</h2>
              <div className="space-y-2">
                <StatusItem 
                  label="Supabase URL" 
                  ok={status?.environment.hasSupabaseUrl} 
                />
                <StatusItem 
                  label="Supabase Anon Key" 
                  ok={status?.environment.hasSupabaseAnonKey} 
                />
                <StatusItem 
                  label="Service Role Key" 
                  ok={status?.environment.hasServiceRoleKey}
                  critical
                />
              </div>
            </div>

            {/* Auth Status */}
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Authentication</h2>
              {status?.auth ? (
                <div className="space-y-2">
                  <StatusItem label="Logged In" ok={status.auth.authenticated} />
                  <p className="text-sm text-gray-500">User ID: {status.auth.userId}</p>
                  <p className="text-sm text-gray-500">Email: {status.auth.email}</p>
                </div>
              ) : (
                <p className="text-red-600">Not authenticated - please log in first</p>
              )}
            </div>

            {/* Business Status */}
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Business</h2>
              {status?.business ? (
                <div className="space-y-2">
                  <StatusItem label="Business Exists" ok={status.business.exists} />
                  {status.business.data && (
                    <>
                      <StatusItem 
                        label="Onboarding Completed" 
                        ok={status.business.data.onboarding_completed} 
                      />
                      <p className="text-sm text-gray-500">Name: {status.business.data.name}</p>
                      <p className="text-sm text-gray-500">ID: {status.business.data.id}</p>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-amber-600">No business found</p>
              )}
            </div>

            {/* Local Error */}
            {errorMsg && (
              <div className="bg-red-50 rounded-xl border border-red-200 p-6">
                <p className="text-red-700">{errorMsg}</p>
              </div>
            )}

            {/* Errors */}
            {status?.errors && status.errors.length > 0 && (
              <div className="bg-red-50 rounded-xl border border-red-200 p-6">
                <h2 className="font-semibold text-red-900 mb-4">Errors</h2>
                <ul className="space-y-1">
                  {status.errors.map((err, i) => (
                    <li key={i} className="text-sm text-red-700">{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Fix Result */}
            {fixResult && (
              <div className={`rounded-xl border p-6 ${fixResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <h2 className={`font-semibold mb-4 ${fixResult.success ? 'text-green-900' : 'text-red-900'}`}>
                  {fixResult.success ? 'Success!' : 'Fix Failed'}
                </h2>
                <p className={`text-sm ${fixResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {fixResult.message || fixResult.error}
                </p>
                {fixResult.success && fixResult.redirectTo && (
                  <p className="text-sm text-green-600 mt-2">Redirecting to dashboard...</p>
                )}
                {fixResult.details && (
                  <p className="text-xs text-gray-500 mt-2">Details: {fixResult.details}</p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={checkStatus}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition-colors"
              >
                <RiRefreshLine className="w-4 h-4" />
                Refresh Status
              </button>
              
              <button
                onClick={fixOnboarding}
                disabled={fixing || !status?.auth?.authenticated}
                className="flex items-center gap-2 px-6 py-2 bg-brand-600 hover:bg-brand-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
              >
                {fixing ? (
                  <>
                    <RiLoader4Line className="w-4 h-4 animate-spin" />
                    Fixing...
                  </>
                ) : (
                  <>
                    <RiCheckboxCircleLine className="w-4 h-4" />
                    Force Complete Onboarding
                  </>
                )}
              </button>
            </div>

            {!status?.auth?.authenticated && (
              <p className="text-amber-600 text-sm">
                You need to be logged in to fix onboarding. <a href="/login" className="underline">Go to login</a>
              </p>
            )}

            {!status?.environment.hasServiceRoleKey && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-amber-800 text-sm font-medium">Missing Service Role Key</p>
                <p className="text-amber-700 text-sm mt-1">
                  Add <code className="bg-amber-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> to your Vercel environment variables.
                  Get it from Supabase Dashboard → Settings → API → service_role key.
                </p>
              </div>
            )}

            {/* Direct Dashboard Link */}
            <div className="text-center pt-4 border-t">
              <a 
                href="/dashboard" 
                className="text-brand-600 hover:text-brand-700 font-medium"
              >
                Try going to dashboard directly →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusItem({ label, ok, critical }: { label: string; ok?: boolean; critical?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <RiCheckboxCircleLine className="w-5 h-5 text-green-500" />
      ) : (
        <RiErrorWarningLine className={`w-5 h-5 ${critical ? 'text-red-500' : 'text-amber-500'}`} />
      )}
      <span className={ok ? 'text-gray-700' : critical ? 'text-red-700' : 'text-amber-700'}>
        {label}: {ok ? 'OK' : 'Missing'}
      </span>
    </div>
  );
}
