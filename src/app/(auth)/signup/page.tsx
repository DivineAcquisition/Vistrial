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
  RiArrowLeftLine,
  RiGoogleFill,
} from "@remixicon/react";
import { signUpStep1, signUpStep2, resendVerificationCode, signInWithGoogle } from "@/lib/auth/actions";
import { cn } from "@/lib/utils/cn";

type Step = "info" | "verify";

export default function SignUpPage() {
  const [step, setStep] = useState<Step>("info");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);

  const [formData, setFormData] = useState({
    fullName: "",
    businessName: "",
    email: "",
    phone: "",
    password: "",
    verifyVia: "email" as "email" | "sms",
    code: "",
  });

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Step 1: Submit info and send verification code
  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signUpStep1({
      email: formData.email,
      phone: formData.phone,
      fullName: formData.fullName,
      businessName: formData.businessName,
      verifyVia: formData.verifyVia,
    });

    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setStep("verify");
    setResendCountdown(60);
    startResendCountdown();
    setLoading(false);
  };

  // Step 2: Verify code and create account
  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signUpStep2({
      email: formData.email,
      phone: formData.phone,
      fullName: formData.fullName,
      businessName: formData.businessName,
      password: formData.password,
      code: formData.code,
      verifyVia: formData.verifyVia,
    });

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0) return;

    setLoading(true);
    const destination = formData.verifyVia === "email" ? formData.email : formData.phone;
    const result = await resendVerificationCode(formData.verifyVia, destination);

    if (result?.error) {
      setError(result.error);
    } else {
      setResendCountdown(60);
      startResendCountdown();
    }
    setLoading(false);
  };

  const startResendCountdown = () => {
    const interval = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    await signInWithGoogle("/dashboard");
  };

  const isStep1Valid =
    formData.fullName &&
    formData.businessName &&
    formData.email &&
    formData.phone &&
    formData.password.length >= 8;

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        {step === "info" ? (
          <>
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

            {/* Google Sign Up */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors mb-6"
            >
              <RiGoogleFill className="w-5 h-5" />
              Continue with Google
            </button>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-slate-400">or sign up with email</span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleStep1} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Your name
                </label>
                <div className="relative">
                  <RiUserLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => updateField("fullName", e.target.value)}
                    placeholder="John Smith"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
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
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email address
                </label>
                <div className="relative">
                  <RiMailLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="john@sparkleclean.com"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Phone number
                </label>
                <div className="relative">
                  <RiPhoneLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
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
                    className="w-full pl-10 pr-12 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <RiEyeOffLine className="w-5 h-5" /> : <RiEyeLine className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">At least 8 characters</p>
              </div>

              {/* Verify Via */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Verify via
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => updateField("verifyVia", "email")}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors",
                      formData.verifyVia === "email"
                        ? "border-violet-500 bg-violet-50 text-violet-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField("verifyVia", "sms")}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors",
                      formData.verifyVia === "sms"
                        ? "border-violet-500 bg-violet-50 text-violet-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    SMS
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !isStep1Valid}
                className="w-full bg-violet-600 text-white py-3 rounded-lg font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 mt-6"
              >
                {loading ? (
                  <>
                    <RiLoader4Line className="w-5 h-5 animate-spin" />
                    Sending code...
                  </>
                ) : (
                  "Continue"
                )}
              </button>
            </form>

            {/* Sign in link */}
            <p className="text-center text-slate-600 mt-6">
              Already have an account?{" "}
              <Link href="/login" className="text-violet-600 font-semibold hover:text-violet-700">
                Sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            {/* Verification Step */}
            <button
              onClick={() => setStep("info")}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
            >
              <RiArrowLeftLine className="w-4 h-4" />
              Back
            </button>

            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-slate-900">Verify your {formData.verifyVia}</h1>
              <p className="text-slate-500 mt-1">
                We sent a 6-digit code to{" "}
                <strong>{formData.verifyVia === "email" ? formData.email : formData.phone}</strong>
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleStep2} className="space-y-6">
              {/* Code Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Verification code
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => updateField("code", e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full text-center text-2xl font-mono tracking-[0.5em] py-4 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={loading || formData.code.length !== 6}
                className="w-full bg-violet-600 text-white py-3 rounded-lg font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RiLoader4Line className="w-5 h-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Create account"
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCountdown > 0 || loading}
                  className="text-sm text-violet-600 hover:text-violet-700 disabled:text-slate-400"
                >
                  {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : "Resend code"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
