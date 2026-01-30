"use client";

import { useState } from "react";
import Link from "next/link";
import {
  RiEyeLine,
  RiEyeOffLine,
  RiLoader4Line,
  RiArrowRightLine,
  RiCheckLine,
} from "@remixicon/react";
import { signUp } from "@/lib/auth/actions";

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");

    const result = await signUp(formData);

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
          Create account
        </h1>
        <p className="text-xs text-gray-400">
          Start your free trial today
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
      <form action={handleSubmit} className="space-y-3">
        {/* Full Name */}
        <div>
          <label
            htmlFor="fullName"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            Your name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            placeholder="John Smith"
            className="w-full px-3 py-2.5 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/25 transition-colors"
          />
        </div>

        {/* Business Name */}
        <div>
          <label
            htmlFor="businessName"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            Business name
          </label>
          <input
            id="businessName"
            name="businessName"
            type="text"
            required
            placeholder="Sparkle Clean Co"
            className="w-full px-3 py-2.5 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/25 transition-colors"
          />
        </div>

        {/* Phone */}
        <div>
          <label
            htmlFor="phone"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            placeholder="(555) 123-4567"
            className="w-full px-3 py-2.5 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/25 transition-colors"
          />
        </div>

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
            placeholder="john@company.com"
            className="w-full px-3 py-2.5 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/25 transition-colors"
          />
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium text-gray-400 mb-1.5"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
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
          <p className="text-[10px] text-gray-600 mt-1">
            At least 8 characters
          </p>
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
              <span>Creating account...</span>
            </>
          ) : (
            <>
              <span>Create account</span>
              <RiArrowRightLine className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Features */}
      <div className="mt-4 pt-4 border-t border-white/5">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center">
          {["Free trial", "No credit card", "Cancel anytime"].map((feature) => (
            <div
              key={feature}
              className="flex items-center gap-1.5 text-[11px] text-gray-500"
            >
              <RiCheckLine className="w-3 h-3 text-green-500" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sign in link */}
      <p className="text-center text-xs text-gray-500 mt-4">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-brand-400 font-medium hover:text-brand-300 transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
