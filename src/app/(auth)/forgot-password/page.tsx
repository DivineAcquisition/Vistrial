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
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <RiCheckLine className="w-7 h-7 text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          Check your email
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          We&apos;ve sent a password reset link to your email.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-brand-600 font-medium hover:text-brand-700 transition-colors"
        >
          <RiArrowLeftLine className="w-4 h-4" />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Reset password
        </h1>
        <p className="text-sm text-gray-500">
          Enter your email for a reset link
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
      <form action={handleSubmit} className="space-y-4">
        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1.5"
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
            className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-brand-500/25"
        >
          {loading ? (
            <>
              <RiLoader4Line className="w-5 h-5 animate-spin" />
              <span>Sending...</span>
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
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RiArrowLeftLine className="w-4 h-4" />
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
