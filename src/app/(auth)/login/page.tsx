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
  RiArrowRightLine,
} from "@remixicon/react";
import { signIn } from "@/lib/auth/actions";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "";

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

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

  return (
    <div className="w-full">
      {/* Header */}
      <div className="text-center mb-8 space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
          </span>
          <span className="text-sm font-medium text-brand-400">Welcome back</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
          Sign in to Vistrial
        </h1>
        <p className="text-gray-400">
          Continue managing your quote follow-ups
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-red-400 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <form action={handleSubmit} className="space-y-5">
        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-2"
          >
            <RiMailLine className="h-4 w-4 text-gray-500" />
            Email address
          </label>
          <div className={`relative rounded-xl transition-all duration-300 ${focusedField === "email" ? "ring-2 ring-brand-500/50" : ""}`}>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="password"
              className="flex items-center gap-1 text-sm font-medium text-gray-300"
            >
              <RiLockLine className="h-4 w-4 text-gray-500" />
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className={`relative rounded-xl transition-all duration-300 ${focusedField === "password" ? "ring-2 ring-brand-500/50" : ""}`}>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
              className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
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
          disabled={loading}
          className="group relative w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {/* Button gradient background */}
          <div className="absolute inset-0 bg-gradient-to-r from-brand-500 to-brand-600" />
          {/* Hover glow */}
          <div className="absolute inset-0 bg-gradient-to-r from-brand-400 to-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          {/* Shine effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          
          {loading ? (
            <>
              <RiLoader4Line className="relative w-5 h-5 animate-spin" />
              <span className="relative">Signing in...</span>
            </>
          ) : (
            <>
              <span className="relative">Sign in</span>
              <RiArrowRightLine className="relative w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </form>

      {/* Sign up link */}
      <p className="text-center text-gray-400 mt-8">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-brand-400 font-semibold hover:text-brand-300 transition-colors"
        >
          Sign up free
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full flex items-center justify-center p-8">
          <RiLoader4Line className="w-8 h-8 animate-spin text-brand-400" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
