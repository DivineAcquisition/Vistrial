"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  RiEyeLine,
  RiEyeOffLine,
  RiLoader4Line,
  RiLockLine,
  RiCloseCircleLine,
} from "@remixicon/react";
import { acceptInvitation } from "@/lib/auth/actions";

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);

  useEffect(() => {
    const checkInvitation = async () => {
      // Try to accept without password first (existing user)
      const result = await acceptInvitation(token);

      if (result?.needsPassword) {
        setNeedsPassword(true);
        setChecking(false);
      } else if (result?.error) {
        setError(result.error);
        setChecking(false);
      }
      // If no error and no needsPassword, the redirect happens automatically
    };

    checkInvitation();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    setError("");

    const result = await acceptInvitation(token, password);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border p-8 text-center">
          <RiLoader4Line className="w-8 h-8 animate-spin mx-auto mb-4 text-violet-600" />
          <p className="text-slate-600">Verifying invitation...</p>
        </div>
      </div>
    );
  }

  if (error && !needsPassword) {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <RiCloseCircleLine className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Invalid Invitation</h1>
          <p className="text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-xl border p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Join the team</h1>
          <p className="text-slate-500 mt-1">Create your account to accept the invitation</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Create password
            </label>
            <div className="relative">
              <RiLockLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            <p className="text-xs text-slate-500 mt-1">At least 8 characters</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-violet-600 text-white py-3 rounded-lg font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RiLoader4Line className="w-5 h-5 animate-spin" />
                Joining...
              </>
            ) : (
              "Accept invitation"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
