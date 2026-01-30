"use client";

import { useState } from "react";
import Link from "next/link";
import {
  RiEyeLine,
  RiEyeOffLine,
  RiLoader4Line,
  RiMailLine,
  RiLockLine,
  RiUserLine,
  RiBuilding2Line,
  RiPhoneLine,
  RiCheckboxCircleLine,
  RiArrowRightLine,
} from "@remixicon/react";
import { signUp } from "@/lib/auth/actions";

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

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
      <div className="text-center mb-8 space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-sm font-medium text-green-400">Get started free</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
          Create your account
        </h1>
        <p className="text-gray-400">
          Start booking more customers today
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
      <form action={handleSubmit} className="space-y-4">
        {/* Full Name */}
        <div>
          <label
            htmlFor="fullName"
            className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-2"
          >
            <RiUserLine className="h-4 w-4 text-gray-500" />
            Your name
          </label>
          <div className={`relative rounded-xl transition-all duration-300 ${focusedField === "fullName" ? "ring-2 ring-brand-500/50" : ""}`}>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              required
              placeholder="John Smith"
              onFocus={() => setFocusedField("fullName")}
              onBlur={() => setFocusedField(null)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Business Name */}
        <div>
          <label
            htmlFor="businessName"
            className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-2"
          >
            <RiBuilding2Line className="h-4 w-4 text-gray-500" />
            Business name
          </label>
          <div className={`relative rounded-xl transition-all duration-300 ${focusedField === "businessName" ? "ring-2 ring-brand-500/50" : ""}`}>
            <input
              id="businessName"
              name="businessName"
              type="text"
              required
              placeholder="Sparkle Clean Co"
              onFocus={() => setFocusedField("businessName")}
              onBlur={() => setFocusedField(null)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            Your booking link: book.vistrial.io/sparkle-clean-co
          </p>
        </div>

        {/* Phone */}
        <div>
          <label
            htmlFor="phone"
            className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-2"
          >
            <RiPhoneLine className="h-4 w-4 text-gray-500" />
            Phone number
          </label>
          <div className={`relative rounded-xl transition-all duration-300 ${focusedField === "phone" ? "ring-2 ring-brand-500/50" : ""}`}>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              placeholder="(555) 123-4567"
              onFocus={() => setFocusedField("phone")}
              onBlur={() => setFocusedField(null)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors"
            />
          </div>
        </div>

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
              placeholder="john@sparkleclean.com"
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="password"
            className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-2"
          >
            <RiLockLine className="h-4 w-4 text-gray-500" />
            Password
          </label>
          <div className={`relative rounded-xl transition-all duration-300 ${focusedField === "password" ? "ring-2 ring-brand-500/50" : ""}`}>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
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
          <p className="text-xs text-gray-500 mt-1.5">
            Must be at least 8 characters
          </p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="group relative w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 mt-2"
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
              <span className="relative">Creating account...</span>
            </>
          ) : (
            <>
              <span className="relative">Create account</span>
              <RiArrowRightLine className="relative w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </form>

      {/* Features */}
      <div className="mt-6 pt-6 border-t border-white/10">
        <p className="text-xs text-gray-500 mb-3 text-center font-medium">
          What you get:
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            "Embeddable booking page",
            "Membership billing",
            "Customer portal",
            "First 10 members free",
          ].map((feature) => (
            <div
              key={feature}
              className="flex items-center gap-2 text-sm text-gray-400"
            >
              <RiCheckboxCircleLine className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sign in link */}
      <p className="text-center text-gray-400 mt-6">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-brand-400 font-semibold hover:text-brand-300 transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
