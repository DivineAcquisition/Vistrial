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
      <div className="text-center mb-5 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-1">
          Welcome back
        </h1>
        <p className="text-xs md:text-sm text-gray-500">
          Sign in to your account
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-3 md:mb-4 p-2.5 md:p-3 bg-red-50 border border-red-200 rounded-lg md:rounded-xl text-red-600 text-xs md:text-sm flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <form action={handleSubmit} className="space-y-3 md:space-y-4">
        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="block text-xs md:text-sm font-medium text-gray-700 mb-1 md:mb-1.5"
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
            className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg md:rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
          />
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1 md:mb-1.5">
            <label
              htmlFor="password"
              className="block text-xs md:text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs md:text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
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
              className="w-full px-3 md:px-4 py-2.5 md:py-3 pr-10 md:pr-11 text-sm bg-gray-50 border border-gray-200 rounded-lg md:rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPassword ? (
                <RiEyeOffLine className="w-4 h-4 md:w-5 md:h-5" />
              ) : (
                <RiEyeLine className="w-4 h-4 md:w-5 md:h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="relative w-full flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 before:absolute before:inset-[1px] before:rounded-[7px] md:before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
        >
          {loading ? (
            <>
              <RiLoader4Line className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <span>Sign in</span>
              <RiArrowRightLine className="w-4 h-4 md:w-5 md:h-5" />
            </>
          )}
        </button>
      </form>

      {/* Sign up link */}
      <p className="text-center text-xs md:text-sm text-gray-500 mt-5 md:mt-6">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-brand-600 font-semibold hover:text-brand-700 transition-colors"
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
          <RiLoader4Line className="w-6 h-6 animate-spin text-brand-500" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
