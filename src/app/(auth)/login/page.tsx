"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  RiEyeLine,
  RiEyeOffLine,
  RiLoader4Line,
  RiMailLine,
  RiLockLine,
  RiGoogleFill,
  RiArrowRightLine,
  RiSparklingLine,
  RiFlashlightLine,
  RiCheckboxCircleLine,
} from "@remixicon/react";
import { signIn, signInWithGoogle } from "@/lib/auth/actions";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");
    formData.append("redirect", redirect);

    const result = await signIn(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    await signInWithGoogle(redirect);
  };

  const features = [
    { text: "Easy online booking", icon: RiSparklingLine },
    { text: "Automated reminders", icon: RiFlashlightLine },
    { text: "Smart scheduling", icon: RiCheckboxCircleLine },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-700 bg-brand-100 rounded-full">
            <RiSparklingLine className="w-3.5 h-3.5" />
            Welcome back
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Sign in to your account
        </h1>
        <p className="text-slate-500">
          Continue managing your bookings and customers
        </p>
      </div>

      {/* Features pills */}
      <div className="flex flex-wrap gap-2">
        {features.map((feature) => (
          <div
            key={feature.text}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-gradient-to-r from-slate-50 to-slate-100 rounded-full border border-slate-200/50 hover:border-brand-300 hover:bg-brand-50 transition-all duration-300"
          >
            <feature.icon className="w-3.5 h-3.5 text-brand-500" />
            {feature.text}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Google Sign In */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading || loading}
        className="group relative w-full h-12 text-sm font-medium rounded-xl bg-white border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all duration-300 flex items-center justify-center gap-3 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {googleLoading ? (
          <RiLoader4Line className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <RiGoogleFill className="w-5 h-5" />
            Continue with Google
            <RiArrowRightLine className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </>
        )}
      </button>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-400">
            Or continue with email
          </span>
        </div>
      </div>

      {/* Email Form */}
      <form action={handleSubmit} className="space-y-5">
        {/* Email */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">
            Email address
          </label>
          <div className="relative">
            <RiMailLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={loading}
              placeholder="you@company.com"
              className="w-full h-12 pl-11 pr-4 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <RiLockLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={loading}
              placeholder="••••••••"
              className="w-full h-12 pl-11 pr-12 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPassword ? (
                <RiEyeOffLine className="w-5 h-5" />
              ) : (
                <RiEyeLine className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || googleLoading}
          className="group relative w-full h-12 text-sm font-semibold rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
        >
          {loading ? (
            <RiLoader4Line className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Sign in to your account
              <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </form>

      {/* Sign up link */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-100" />
        </div>
        <div className="relative flex justify-center">
          <p className="px-4 bg-gradient-to-br from-slate-50 to-slate-100 text-sm text-slate-500">
            New to Vistrial?{" "}
            <Link
              href="/signup"
              className="text-brand-600 hover:text-brand-700 font-semibold transition-colors"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function LoginLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <RiLoader4Line className="w-8 h-8 animate-spin text-brand-600" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
