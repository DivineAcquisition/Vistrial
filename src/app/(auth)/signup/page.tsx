"use client";

import { useState } from "react";
import Link from "next/link";
import {
  RiEyeLine,
  RiEyeOffLine,
  RiLoader4Line,
  RiUserLine,
  RiBuilding2Line,
  RiMailLine,
  RiLockLine,
  RiPhoneLine,
  RiCheckLine,
} from "@remixicon/react";
import { signUp } from "@/lib/auth/actions";

export default function SignUpPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    businessName: "",
    email: "",
    phone: "",
    password: "",
  });

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signUp(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  };

  const isValid =
    formData.firstName &&
    formData.lastName &&
    formData.businessName &&
    formData.email &&
    formData.password.length >= 8;

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-xl border p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
          <p className="text-slate-500 mt-1">Start your 14-day free trial</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                First name
              </label>
              <div className="relative">
                <RiUserLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                  placeholder="John"
                  required
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-900"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Last name
              </label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => updateField("lastName", e.target.value)}
                placeholder="Smith"
                required
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-900"
              />
            </div>
          </div>

          {/* Business Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Business name
            </label>
            <div className="relative">
              <RiBuilding2Line className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={formData.businessName}
                onChange={(e) => updateField("businessName", e.target.value)}
                placeholder="Sparkle Clean Co"
                required
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-900"
              />
            </div>
            {formData.businessName && (
              <p className="text-xs text-slate-500 mt-1">
                Your booking link: book.vistrial.io/
                {formData.businessName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <div className="relative">
              <RiMailLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="john@sparkleclean.com"
                required
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-900"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Phone <span className="text-slate-400">(optional)</span>
            </label>
            <div className="relative">
              <RiPhoneLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-900"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <div className="relative">
              <RiLockLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className="w-full pl-10 pr-12 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <RiEyeOffLine className="w-5 h-5" /> : <RiEyeLine className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">At least 8 characters</p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !isValid}
            className="w-full bg-violet-600 text-white py-3 rounded-lg font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RiLoader4Line className="w-5 h-5 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create account"
            )}
          </button>
        </form>

        {/* Features */}
        <div className="mt-6 pt-6 border-t">
          <p className="text-xs text-slate-500 mb-3 text-center">Includes:</p>
          <div className="grid grid-cols-2 gap-2">
            {["Booking page", "Customer portal", "SMS notifications", "First 10 members free"].map(
              (feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm text-slate-600">
                  <RiCheckLine className="w-4 h-4 text-green-500 flex-shrink-0" />
                  {feature}
                </div>
              )
            )}
          </div>
        </div>

        {/* Sign in link */}
        <p className="text-center text-slate-600 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-violet-600 font-semibold hover:text-violet-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
