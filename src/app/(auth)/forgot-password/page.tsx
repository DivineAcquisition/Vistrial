"use client";

import { useState } from "react";
import Link from "next/link";
import {
  RiLoader4Line,
  RiMailLine,
  RiArrowLeftLine,
  RiCheckboxCircleLine,
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
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <RiCheckboxCircleLine className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h1>
          <p className="text-slate-500 mb-6">
            We&apos;ve sent a password reset link to your email address.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-violet-600 font-semibold hover:text-violet-700"
          >
            <RiArrowLeftLine className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Reset password</h1>
          <p className="text-slate-500 mt-1">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form action={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email address
            </label>
            <div className="relative">
              <RiMailLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-violet-600 text-white py-3 rounded-lg font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RiLoader4Line className="w-5 h-5 animate-spin" />
                Sending...
              </>
            ) : (
              "Send reset link"
            )}
          </button>
        </form>

        {/* Back to login */}
        <p className="text-center mt-6">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-violet-600 font-semibold hover:text-violet-700"
          >
            <RiArrowLeftLine className="w-4 h-4" />
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
