"use client";

import { useState } from "react";
import Link from "next/link";
import {
  RiLoader4Line,
  RiArrowLeftLine,
  RiCheckLine,
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
      <div className="w-full text-center">
        <div className="w-12 h-12 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <RiCheckLine className="w-6 h-6 text-green-400" />
        </div>
        <h1 className="text-lg font-bold text-white mb-1">
          Check your email
        </h1>
        <p className="text-xs text-gray-400 mb-6">
          We&apos;ve sent a password reset link to your email.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-brand-400 font-medium hover:text-brand-300 transition-colors"
        >
          <RiArrowLeftLine className="w-3.5 h-3.5" />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="text-center mb-5">
        <h1 className="text-xl font-bold text-white mb-1">
          Reset password
        </h1>
        <p className="text-xs text-gray-400">
          Enter your email for a reset link
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

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-brand-500/20"
        >
          {loading ? (
            <>
              <RiLoader4Line className="w-4 h-4 animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            "Send reset link"
          )}
        </button>
      </form>

      {/* Back to login */}
      <p className="text-center mt-5">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <RiArrowLeftLine className="w-3.5 h-3.5" />
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
