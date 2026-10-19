"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, KeyRound, X, CheckCircle2, ArrowRight, ShieldAlert, ShieldCheck, UserCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotNotes, setForgotNotes] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  const [isRequestRaised, setIsRequestRaised] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Forced new permanent password modal state (when logging in with a temporary password)
  const [showSetNewPasswordModal, setShowSetNewPasswordModal] = useState(false);
  const [tempCreds, setTempCreds] = useState<{ email: string; password: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [settingNewPassword, setSettingNewPassword] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Login failed");
        return;
      }

      // Check if user is logging in with a temporary password and must set a new permanent password
      if (data.mustChangePassword) {
        setTempCreds({ email: email.trim(), password });
        setShowSetNewPasswordModal(true);
        toast.info("Temporary password verified. Please set your new permanent password.");
        return;
      }

      toast.success(`Welcome back, ${data.user.fullName}!`);
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toast.error("New password must be at least 6 characters in length");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setSettingNewPassword(true);
    try {
      const res = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword,
          email: tempCreds?.email,
          temporaryPassword: tempCreds?.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update password");
        return;
      }

      toast.success("Permanent password created successfully! Welcome to Textora Engage.");
      setShowSetNewPasswordModal(false);
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Network error while setting new password. Please try again.");
    } finally {
      setSettingNewPassword(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error("Please enter your registered email address");
      return;
    }

    setForgotLoading(true);
    setForgotMessage("");
    setIsRequestRaised(false);
    setIsSuperAdmin(false);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          notes: forgotNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to process request");
        return;
      }

      setForgotMessage(data.message || "Password reset request processed.");
      if (data.isRequestRaised) {
        setIsRequestRaised(true);
        toast.success("Request raised to Level 3 Super Admin! 🛡️");
      } else if (data.isSuperAdmin) {
        setIsSuperAdmin(true);
        toast.success("Temporary password dispatched to your email! 📬");
      } else {
        toast.success("Request processed. Please check with your administrator.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  }

  function openForgotModal() {
    setForgotEmail(email || "");
    setForgotNotes("");
    setForgotMessage("");
    setIsRequestRaised(false);
    setIsSuperAdmin(false);
    setShowForgotModal(true);
  }

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
            Sales & Follow-Up CRM
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 border-t-4 border-emerald-500">
          <h2 className="text-lg font-bold text-gray-900 mb-1">
            Sign In
          </h2>
          <p className="text-xs text-gray-500 mb-6">
            Enter your Textora credentials to access your console
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="aaditya@textorasms.com"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition text-sm bg-gray-50/50"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={openForgotModal}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline transition cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition text-sm pr-10 bg-gray-50/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  {showPw ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
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
                  Signing in...
                </>
              ) : (
                "Sign In to Console"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] text-gray-400 font-medium">
            © Textora Technologies Pvt Ltd · Internal CRM
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
            <div className="bg-gradient-to-r from-slate-900 to-emerald-950 px-6 py-4 flex items-center justify-between text-white border-b border-emerald-500/20">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm tracking-wide">
                  Account Password Assistance
                </h3>
              </div>
              <button
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {forgotMessage ? (
                <div className="space-y-4 text-center py-2">
                  {isRequestRaised ? (
                    <>
                      <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mx-auto shadow-xs">
                        <ShieldAlert className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-base">
                          Request Forwarded to Super Admin
                        </h4>
                        <span className="inline-block mt-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                          Level 1 & Level 2 Security Protocol
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed max-w-sm mx-auto">
                        {forgotMessage}
                      </p>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs space-y-1">
                        <span className="font-bold text-slate-800 block flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                          Next Step:
                        </span>
                        <p className="text-slate-600 text-[11px]">
                          Your organization&apos;s Level 3 Super Admin has been notified. They can set a new password for you from the <strong>Team Management</strong> console.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-base">
                          Super Admin Reset Link Sent!
                        </h4>
                        <span className="inline-block mt-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Level 3 Direct Access
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        {forgotMessage}
                      </p>
                      {devPreviewUrl && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs space-y-1">
                          <span className="font-bold text-amber-800 block">
                            ⚙️ Development Direct Reset Link:
                          </span>
                          <a
                            href={devPreviewUrl}
                            className="text-emerald-700 underline font-medium break-all block hover:text-emerald-800"
                          >
                            {devPreviewUrl}
                          </a>
                        </div>
                      )}
                    </>
                  )}

                  <button
                    onClick={() => setShowForgotModal(false)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl transition text-xs shadow-xs cursor-pointer mt-2"
                  >
                    Return to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-xs space-y-1">
                    <span className="font-bold text-emerald-950 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Role-Based Access Policy:
                    </span>
                    <p className="text-emerald-800 text-[11px] leading-relaxed">
                      Level 1 & Level 2 team members can submit a request here to be processed by a Level 3 Super Admin. Level 3 Super Admins will receive a direct reset link.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Registered Work Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                        placeholder="aaditya@textorasms.com"
                        className="w-full pl-10 pr-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition text-sm bg-gray-50/50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Note to Administrator (Optional)
                    </label>
                    <textarea
                      value={forgotNotes}
                      onChange={(e) => setForgotNotes(e.target.value)}
                      rows={2}
                      placeholder="e.g. Need password reset for new work device..."
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition text-xs bg-gray-50/50 resize-none text-gray-800"
                    />
                  </div>

                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      className="px-4 py-2.5 text-xs text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="px-5 py-2.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-300 text-white font-semibold rounded-xl transition flex items-center gap-1.5 shadow-sm shadow-emerald-900/10 cursor-pointer"
                    >
                      {forgotLoading ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          Submit Request / Send Link
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
