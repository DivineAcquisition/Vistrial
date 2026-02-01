"use client";

import { useState } from "react";
import Link from "next/link";
import {
  RiLoader4Line,
  RiMailLine,
  RiArrowLeftLine,
  RiArrowRightLine,
  RiCheckboxCircleLine,
  RiLockUnlockLine,
} from "@remixicon/react";
import { resetPassword } from "@/lib/auth/actions";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");

    const result = await resetPassword(formData);

    if (result?.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }

    setLoading(false);
  }

  if (success) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <RiCheckboxCircleLine className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Check your email
          </h1>
          <p className="text-slate-500">
            We&apos;ve sent a password reset link to your email address.
          </p>
        </div>

        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-600 text-sm">
          <p>
            Didn&apos;t receive the email? Check your spam folder or request a new
            link.
          </p>
        </div>

        <Link
          href="/login"
          className="group w-full h-12 text-sm font-medium rounded-xl bg-white border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all duration-300 flex items-center justify-center gap-2"
        >
          <RiArrowLeftLine className="w-4 h-4" />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 bg-violet-100 rounded-full">
            <RiLockUnlockLine className="w-3.5 h-3.5" />
            Password reset
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Forgot your password?
        </h1>
        <p className="text-slate-500">
          No worries! Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Form */}
      <form action={handleSubmit} className="space-y-5">
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
              className="w-full h-12 pl-11 pr-4 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="group relative w-full h-12 text-sm font-semibold rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:opacity-90 hover:shadow-lg hover:shadow-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <RiLoader4Line className="w-5 h-5 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              Send reset link
              <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </form>

      {/* Back to login */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-100" />
        </div>
        <div className="relative flex justify-center">
          <Link
            href="/login"
            className="px-4 bg-gradient-to-br from-slate-50 to-slate-100 inline-flex items-center gap-2 text-sm text-violet-600 font-semibold hover:text-violet-700 transition-colors"
          >
            <RiArrowLeftLine className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
