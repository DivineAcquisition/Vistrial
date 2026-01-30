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
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Create account
        </h1>
        <p className="text-sm text-gray-500">
          Start your free trial today
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <form action={handleSubmit} className="space-y-3.5">
        {/* Full Name */}
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1.5">
            Your name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            placeholder="John Smith"
            className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
          />
        </div>

        {/* Business Name */}
        <div>
          <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1.5">
            Business name
          </label>
          <input
            id="businessName"
            name="businessName"
            type="text"
            required
            placeholder="Sparkle Clean Co"
            className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
          />
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1.5">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            placeholder="(555) 123-4567"
            className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="john@company.com"
            className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
          />
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
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
              className="w-full px-4 py-3 pr-11 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPassword ? (
                <RiEyeOffLine className="w-5 h-5" />
              ) : (
                <RiEyeLine className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            At least 8 characters
          </p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 mt-1"
        >
          {loading ? (
            <>
              <RiLoader4Line className="w-5 h-5 animate-spin" />
              <span>Creating account...</span>
            </>
          ) : (
            <>
              <span>Create account</span>
              <RiArrowRightLine className="w-5 h-5" />
            </>
          )}
        </button>
      </form>

      {/* Features */}
      <div className="mt-5 pt-5 border-t border-gray-100">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center">
          {["Free trial", "No credit card", "Cancel anytime"].map((feature) => (
            <div
              key={feature}
              className="flex items-center gap-1.5 text-xs text-gray-500"
            >
              <RiCheckLine className="w-3.5 h-3.5 text-green-500" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sign in link */}
      <p className="text-center text-sm text-gray-500 mt-5">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-brand-600 font-semibold hover:text-brand-700 transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
