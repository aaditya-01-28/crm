"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, CheckCircle2, ArrowLeft, ShieldCheck } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast.error("Missing reset token. Please request a new password reset link.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to reset password");
        return;
      }
      setIsSuccess(true);
      toast.success("Password reset successfully! ✅");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-gray-900">
          Invalid Reset Request
        </h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          No password reset token was detected in your URL. Please click the reset link directly from your email inbox.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700 pt-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Login
        </Link>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="text-center py-6 space-y-4 animate-in fade-in duration-200">
        <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-gray-900">
          Password Updated Successfully!
        </h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          Your credentials have been securely updated. You can now access your Textora Engage console with your new password.
        </p>
        <div className="pt-2">
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl transition text-sm shadow-md shadow-emerald-900/20 cursor-pointer"
          >
            Sign In with New Password
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleReset} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
          New Password
        </label>
        <div className="relative">
          <input
            type={showNewPw ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            placeholder="At least 6 characters"
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition text-sm pr-10 bg-gray-50/50"
          />
          <button
            type="button"
            onClick={() => setShowNewPw(!showNewPw)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
          Confirm New Password
        </label>
        <div className="relative">
          <input
            type={showConfirmPw ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder="Re-enter new password"
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition text-sm pr-10 bg-gray-50/50"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPw(!showConfirmPw)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-300 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-900/20 mt-2 cursor-pointer"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Updating Password...
          </>
        ) : (
          "Save New Password"
        )}
      </button>

      <div className="text-center pt-2">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-700 transition font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Cancel & Return to Login
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative emerald ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo / Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-block p-3 rounded-2xl bg-slate-900/60 border border-emerald-500/20 shadow-xl mb-4 backdrop-blur-sm">
            <img
              src="/logo.png"
              alt="Textora Technologies"
              className="h-12 w-auto mx-auto object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Textora Engage</h1>
          <p className="text-emerald-400 mt-0.5 text-xs font-medium tracking-wide uppercase">
            Account Security & Recovery
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 border-t-4 border-emerald-500">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">
                Set New Password
              </h2>
              <p className="text-xs text-gray-500">
                Choose a strong password to protect your console
              </p>
            </div>
          </div>

          <div className="mt-5">
            <Suspense
              fallback={
                <div className="py-8 flex justify-center">
                  <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              <ResetPasswordForm />
            </Suspense>
          </div>

          <p className="mt-6 text-center text-[11px] text-gray-400 font-medium">
            © Textora Technologies Pvt Ltd · Internal CRM
          </p>
        </div>
      </div>
    </div>
  );
}
