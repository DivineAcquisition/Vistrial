"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  RiEyeLine,
  RiEyeOffLine,
  RiLoader4Line,
  RiArrowRightLine,
} from "@remixicon/react";
import { signIn } from "@/lib/auth/actions";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "";

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="w-full">
      {/* Header */}
      <div className="text-center mb-5">
        <h1 className="text-xl font-bold text-white mb-1">
          Welcome back
        </h1>
        <p className="text-xs text-gray-400">
          Sign in to continue to your dashboard
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <form action={handleSubmit} className="space-y-3.5">
        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="w-full px-3 py-2.5 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/25 transition-colors"
          />
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-medium text-gray-400"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              Forgot?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="w-full px-3 py-2.5 pr-10 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/25 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showPassword ? (
                <RiEyeOffLine className="w-4 h-4" />
              ) : (
                <RiEyeLine className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 mt-1 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-brand-500/20"
        >
          {loading ? (
            <>
              <RiLoader4Line className="w-4 h-4 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <span>Sign in</span>
              <RiArrowRightLine className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Sign up link */}
      <p className="text-center text-xs text-gray-500 mt-5">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-brand-400 font-medium hover:text-brand-300 transition-colors"
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
        <div className="w-full flex items-center justify-center p-6">
          <RiLoader4Line className="w-6 h-6 animate-spin text-brand-400" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
