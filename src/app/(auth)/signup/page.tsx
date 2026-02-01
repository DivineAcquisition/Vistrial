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
  RiArrowRightLine,
  RiGoogleFill,
  RiGiftLine,
  RiShieldCheckLine,
  RiFlashlightLine,
  RiSparklingLine,
  RiCheckLine,
} from "@remixicon/react";
import {
  signUpStep1,
  signUpStep2,
  resendVerificationCode,
  signInWithGoogle,
} from "@/lib/auth/actions";
import { cn } from "@/lib/utils/cn";

type Step = "info" | "verify";

export default function SignUpPage() {
  const [step, setStep] = useState<Step>("info");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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
    setError("");
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
    const destination =
      formData.verifyVia === "email" ? formData.email : formData.phone;
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
    setGoogleLoading(true);
    await signInWithGoogle("/onboarding");
  };

  const isStep1Valid =
    formData.fullName &&
    formData.businessName &&
    formData.email &&
    formData.phone &&
    formData.password.length >= 8;

  const benefits = [
    { text: "14-day free trial", highlight: true, icon: RiGiftLine },
    { text: "No credit card required", highlight: false, icon: RiShieldCheckLine },
    { text: "Cancel anytime", highlight: false, icon: RiFlashlightLine },
  ];

  if (step === "verify") {
    return (
      <div className="space-y-8">
        {/* Back button */}
        <button
          onClick={() => setStep("info")}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
        >
          <RiArrowLeftLine className="w-4 h-4" />
          Back
        </button>

        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Verify your {formData.verifyVia}
          </h1>
          <p className="text-slate-500">
            We sent a 6-digit code to{" "}
            <strong className="text-slate-700">
              {formData.verifyVia === "email" ? formData.email : formData.phone}
            </strong>
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleStep2} className="space-y-6">
          {/* Code Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Verification code
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) =>
                updateField("code", e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              maxLength={6}
              autoFocus
              className="w-full text-center text-2xl font-mono tracking-[0.5em] h-16 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-slate-900 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading || formData.code.length !== 6}
            className="group relative w-full h-12 text-sm font-semibold rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:opacity-90 hover:shadow-lg hover:shadow-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2"
          >
            {loading ? (
              <RiLoader4Line className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Create account
                <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCountdown > 0 || loading}
              className="text-sm text-violet-600 hover:text-violet-700 disabled:text-slate-400 font-medium transition-colors"
            >
              {resendCountdown > 0
                ? `Resend code in ${resendCountdown}s`
                : "Resend code"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 bg-violet-100 rounded-full">
          <RiSparklingLine className="w-3.5 h-3.5" />
          Start free today
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Create your account
        </h1>
        <p className="text-slate-500">
          Join thousands of cleaning businesses using Vistrial
        </p>
      </div>

      {/* Benefits pills */}
      <div className="flex flex-wrap gap-2">
        {benefits.map((benefit) => (
          <div
            key={benefit.text}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all duration-300",
              benefit.highlight
                ? "bg-gradient-to-r from-violet-100 to-purple-100 text-violet-700 font-medium border border-violet-200"
                : "bg-gradient-to-r from-slate-50 to-slate-100 text-slate-600 border border-slate-200/50 hover:border-violet-300"
            )}
          >
            <benefit.icon
              className={cn(
                "w-3.5 h-3.5",
                benefit.highlight ? "text-violet-600" : "text-slate-500"
              )}
            />
            {benefit.text}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Google Sign Up */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading || loading}
        className="group relative w-full h-12 text-sm font-medium rounded-xl bg-white border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all duration-300 flex items-center justify-center gap-3 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {googleLoading ? (
          <RiLoader4Line className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <RiGoogleFill className="w-5 h-5" />
            Continue with Google
            <RiArrowRightLine className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </>
        )}
      </button>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-400">
            Or continue with email
          </span>
        </div>
      </div>

      {/* Email Form */}
      <form onSubmit={handleStep1} className="space-y-4">
        {/* Full Name */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">
            Your name
          </label>
          <div className="relative">
            <RiUserLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={formData.fullName}
              onChange={(e) => updateField("fullName", e.target.value)}
              placeholder="John Smith"
              required
              disabled={loading}
              className="w-full h-12 pl-11 pr-4 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 transition-all"
            />
          </div>
        </div>

        {/* Business Name */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">
            Business name
          </label>
          <div className="relative">
            <RiBuilding2Line className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={formData.businessName}
              onChange={(e) => updateField("businessName", e.target.value)}
              placeholder="Sparkle Clean Co"
              required
              disabled={loading}
              className="w-full h-12 pl-11 pr-4 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 transition-all"
            />
          </div>
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">
            Work email
          </label>
          <div className="relative">
            <RiMailLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="email"
              value={formData.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="john@sparkleclean.com"
              required
              disabled={loading}
              className="w-full h-12 pl-11 pr-4 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 transition-all"
            />
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">
            Phone number
          </label>
          <div className="relative">
            <RiPhoneLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              placeholder="+1 (555) 123-4567"
              required
              disabled={loading}
              className="w-full h-12 pl-11 pr-4 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 transition-all"
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <div className="relative">
            <RiLockLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              disabled={loading}
              className="w-full h-12 pl-11 pr-12 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPassword ? (
                <RiEyeOffLine className="w-5 h-5" />
              ) : (
                <RiEyeLine className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-slate-400">Must be at least 8 characters</p>
        </div>

        {/* Verify Via */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">
            Verify via
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => updateField("verifyVia", "email")}
              disabled={loading}
              className={cn(
                "flex-1 h-11 px-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2",
                formData.verifyVia === "email"
                  ? "border-violet-500 bg-violet-50 text-violet-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              )}
            >
              {formData.verifyVia === "email" && (
                <RiCheckLine className="w-4 h-4" />
              )}
              Email
            </button>
            <button
              type="button"
              onClick={() => updateField("verifyVia", "sms")}
              disabled={loading}
              className={cn(
                "flex-1 h-11 px-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2",
                formData.verifyVia === "sms"
                  ? "border-violet-500 bg-violet-50 text-violet-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              )}
            >
              {formData.verifyVia === "sms" && (
                <RiCheckLine className="w-4 h-4" />
              )}
              SMS
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !isStep1Valid || googleLoading}
          className="group relative w-full h-12 text-sm font-semibold rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:opacity-90 hover:shadow-lg hover:shadow-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2 mt-6"
        >
          {loading ? (
            <>
              <RiLoader4Line className="w-5 h-5 animate-spin" />
              Sending code...
            </>
          ) : (
            <>
              Continue
              <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </form>

      {/* Terms */}
      <p className="text-center text-xs text-slate-400">
        By signing up, you agree to our{" "}
        <Link href="/terms" className="text-violet-600 hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-violet-600 hover:underline">
          Privacy Policy
        </Link>
      </p>

      {/* Sign in link */}
      <div className="relative pt-4 border-t border-slate-100">
        <p className="text-center text-slate-500">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-violet-600 hover:text-violet-700 font-semibold transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
