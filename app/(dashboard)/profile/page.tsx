"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User,
  Mail,
  Phone,
  Lock,
  Globe,
  Building2,
  Shield,
  CheckCircle2,
  KeyRound,
  Eye,
  EyeOff,
  Save,
  Calendar,
  Sparkles,
  BadgeCheck,
  Activity,
  Briefcase,
  AlertCircle,
  PhoneCall,
  Flame,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";

interface UserProfile {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  role: string;
  language: string;
  isActive: boolean;
  createdAt: string;
  tenant: {
    id: string;
    name: string;
    planTier: string;
  };
  _count?: {
    assignedLeads: number;
    callLogs: number;
    deals: number;
  };
}

const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", native: "English", flag: "🇬🇧" },
  { code: "hi", name: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "ta", name: "Tamil", native: "தமிழ்", flag: "🇮🇳" },
  { code: "te", name: "Telugu", native: "తెలుగు", flag: "🇮🇳" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", flag: "🇮🇳" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", flag: "🇮🇳" },
  { code: "mr", name: "Marathi", native: "मराठी", flag: "🇮🇳" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", flag: "🇮🇳" },
  { code: "bn", name: "Bengali", native: "বাংলা", flag: "🇮🇳" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", flag: "🇮🇳" },
  { code: "as", name: "Assamese", native: "অসমীয়া", flag: "🇮🇳" },
  { code: "ur", name: "Urdu", native: "اردو", flag: "🇮🇳" },
];

const ROLE_DETAILS: Record<string, { label: string; badge: string; desc: string; permissions: string[] }> = {
  super_admin: {
    label: "Level 3 • Super Admin",
    badge: "bg-purple-100 text-purple-800 border-purple-200",
    desc: "Complete executive authority across the CRM, tenant configurations, user provisioning, revenue approval, and data governance.",
    permissions: [
      "Manage all team members & user roles",
      "Full access to leads directory & cold lists",
      "Assign & re-assign leads across reps",
      "Approve & verify payment collections",
      "Access EOD reports & global analytics",
    ],
  },
  sales_manager: {
    label: "Level 2 • Sales Manager / Lead",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
    desc: "Operational management of sales reps, bulk lead assignment, performance tracking, and team quota oversight.",
    permissions: [
      "Bulk lead assignment to sales representatives",
      "Import vendor cold lead lists via CSV",
      "Monitor live team leaderboard & dials",
      "View global pipeline stages & deals",
      "Access team calling reports & activity logs",
    ],
  },
  sales_rep: {
    label: "Level 1 • Sales Representative",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    desc: "Direct customer outreach, power dialing, deal negotiations, and disposition updates for assigned prospects.",
    permissions: [
      "Execute outbound calls in the Smart Dialer",
      "Work exclusively on assigned prospect leads",
      "Log call dispositions & schedule callbacks",
      "Create & advance pipeline deals",
      "Submit customer payment proofs for verification",
    ],
  },
  accounts_ops: {
    label: "Support • Accounts & Operations",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    desc: "Financial reconciliation, payment verification, and credit provisioning.",
    permissions: [
      "Review payment slips & bank transaction proofs",
      "Approve or reject customer credit payments",
      "Reconcile panel user accounts with SMS credits",
    ],
  },
};

export default function ProfilePage() {
  const queryClient = useQueryClient();

  // Profile fields state
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [language, setLanguage] = useState("en");

  // Password fields state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Fetch profile
  const { data, isLoading, isError, refetch } = useQuery<{ user: UserProfile }>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) {
        throw new Error("Failed to load profile details");
      }
      return res.json();
    },
  });

  const user = data?.user;

  // Sync state once user is loaded
  useEffect(() => {
    if (user) {
      setFullName(user.fullName || "");
      setPhoneNumber(user.phoneNumber || "");
      setLanguage(user.language || "en");
    }
  }, [user]);

  // Mutation for updating profile
  const updateProfileMutation = useMutation({
    mutationFn: async (payload: {
      fullName?: string;
      phoneNumber?: string;
      language?: string;
      currentPassword?: string;
      newPassword?: string;
    }) => {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Failed to update profile");
      }
      return result;
    },
    onSuccess: (result) => {
      toast.success(result.message || "Profile updated successfully");
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      // Reset password fields if updated
      if (result.passwordUpdated) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "An error occurred while updating profile");
    },
  });

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Full name cannot be empty");
      return;
    }
    updateProfileMutation.mutate({
      fullName: fullName.trim(),
      phoneNumber: phoneNumber.trim(),
      language,
    });
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Please enter your current password");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirm password do not match");
      return;
    }

    updateProfileMutation.mutate({
      currentPassword,
      newPassword,
    });
  };

  const roleMeta = ROLE_DETAILS[user?.role || ""] || {
    label: user?.role || "Member",
    badge: "bg-gray-100 text-gray-800 border-gray-200",
    desc: "Member of Textora Engage CRM platform.",
    permissions: ["Standard workspace access"],
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-pulse pb-12">
        <div className="h-10 w-72 bg-gray-200 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-96 bg-gray-200 rounded-2xl" />
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 bg-gray-200 rounded-2xl" />
            <div className="h-64 bg-gray-200 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-red-50 border border-red-200 rounded-2xl text-center space-y-4">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="text-base font-bold text-red-900">Failed to load profile</h3>
        <p className="text-xs text-red-700">Unable to retrieve your personal account details.</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2.5">
          <User className="w-6 h-6 text-emerald-600" />
          Account & Profile Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your personal details, preferred language, contact line, and security credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Personal Identity & Role Overview */}
        <div className="space-y-6">
          {/* Identity Card */}
          <div className="bg-white rounded-2xl border border-gray-200/90 p-6 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="flex flex-col items-center text-center pb-6 border-b border-gray-100">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-3xl shadow-lg shadow-emerald-700/20 mb-3 border-2 border-white ring-4 ring-emerald-50">
                {user.fullName.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-lg font-bold text-gray-900">{user.fullName}</h2>
              <span className={`mt-1.5 text-[11px] font-bold px-3 py-1 rounded-full border uppercase tracking-wider ${roleMeta.badge}`}>
                {roleMeta.label}
              </span>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active Account
              </div>
            </div>

            {/* Personal Details List */}
            <div className="pt-5 space-y-3.5 text-xs">
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-gray-400 font-medium block text-[11px] uppercase tracking-wider">Email Address</span>
                  <span className="text-gray-800 font-semibold truncate block" title={user.email}>
                    {user.email}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium mt-0.5">
                    <BadgeCheck className="w-3 h-3" /> Verified Work Email
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-gray-400 font-medium block text-[11px] uppercase tracking-wider">Phone / Calling Line</span>
                  <span className="text-gray-800 font-semibold">
                    {user.phoneNumber ? user.phoneNumber : "Not specified"}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Globe className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-gray-400 font-medium block text-[11px] uppercase tracking-wider">Representative Spoken Language</span>
                  <span className="text-gray-800 font-semibold flex items-center gap-1.5">
                    <span>{SUPPORTED_LANGUAGES.find((l) => l.code === user.language)?.flag || "🌐"}</span>
                    <span>{SUPPORTED_LANGUAGES.find((l) => l.code === user.language)?.name || user.language.toUpperCase()}</span>
                  </span>
                  <span className="text-[10px] text-emerald-600 block mt-0.5 font-medium">
                    Regional leads matched to this calling language
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-gray-400 font-medium block text-[11px] uppercase tracking-wider">Workspace Organization</span>
                  <span className="text-gray-800 font-semibold">
                    {user.tenant.name}
                  </span>
                  <span className="text-[10px] text-gray-400 block capitalize">
                    Plan: {user.tenant.planTier}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-gray-400 font-medium block text-[11px] uppercase tracking-wider">Member Since</span>
                  <span className="text-gray-800 font-semibold">
                    {formatDateTime(user.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Productivity Counter Cards (if applicable) */}
            {user._count && (
              <div className="mt-6 pt-5 border-t border-gray-100">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-3">
                  Lifetime Engagement
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-50 border border-gray-200/70 p-2.5 rounded-xl">
                    <span className="text-xs text-gray-500 font-medium block">Leads</span>
                    <span className="text-base font-bold text-gray-900">{user._count.assignedLeads}</span>
                  </div>
                  <div className="bg-gray-50 border border-gray-200/70 p-2.5 rounded-xl">
                    <span className="text-xs text-gray-500 font-medium block">Calls</span>
                    <span className="text-base font-bold text-gray-900">{user._count.callLogs}</span>
                  </div>
                  <div className="bg-gray-50 border border-gray-200/70 p-2.5 rounded-xl">
                    <span className="text-xs text-gray-500 font-medium block">Deals</span>
                    <span className="text-base font-bold text-emerald-700">{user._count.deals}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Role Permissions Card */}
          <div className="bg-white rounded-2xl border border-gray-200/90 p-6 shadow-xs">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-indigo-600" />
              Role Authorization & Capabilities
            </h3>
            <p className="text-xs text-gray-500 mb-3.5 leading-relaxed">
              {roleMeta.desc}
            </p>
            <ul className="space-y-2">
              {roleMeta.permissions.map((perm, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-gray-700 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{perm}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Column: Editable Profile & Security Forms */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Personal Details & Language */}
          <div className="bg-white rounded-2xl border border-gray-200/90 p-6 shadow-xs">
            <div className="border-b border-gray-100 pb-4 mb-5">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Representative Information & Spoken Language
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Update how your name appears to team members and customers, configure your primary outbound caller line, and set your spoken regional language for lead assignment.
              </p>
            </div>

            <form onSubmit={handleSaveDetails} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder="Aaditya Prabhakar"
                    className="w-full pl-10 pr-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-gray-50/40"
                  />
                </div>
              </div>

              {/* Email (Readonly) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Work Email Address
                  </label>
                  <span className="text-[11px] text-gray-400 font-medium">Managed by Administrator</span>
                </div>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    value={user.email}
                    disabled
                    className="w-full pl-10 pr-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-100/70 text-gray-500 cursor-not-allowed select-none"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Contact Phone / Calling Line
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full pl-10 pr-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-gray-50/40"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Used as the representative identifier for outbound telephony routing & SMS signatures.
                </p>
              </div>

              {/* Language Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Representative Spoken / Calling Language <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-gray-50/40 cursor-pointer appearance-none font-medium"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.flag} {lang.name} — ({lang.native})
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-gray-400 font-semibold">
                    ▼
                  </div>
                </div>
                <p className="text-[11px] text-emerald-600 mt-1 font-medium">
                  Leads with matching customer preferred language (e.g. Tamil, Hindi, Gujarati) will be routed and assigned to you.
                </p>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-300 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm flex items-center gap-2 shadow-xs shadow-emerald-900/10 cursor-pointer"
                >
                  {updateProfileMutation.isPending ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving changes...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Details
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Card 2: Security & Password Update */}
          <div className="bg-white rounded-2xl border border-gray-200/90 p-6 shadow-xs">
            <div className="border-b border-gray-100 pb-4 mb-5">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                Change Password & Security
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Ensure your CRM access is secured with a strong password. You will need to verify your current password.
              </p>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              {/* Current Password */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Current Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showCurrentPw ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Enter current password"
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-gray-50/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Grid: New Password & Confirm Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showNewPw ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      placeholder="Minimum 6 characters"
                      className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-gray-50/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    Confirm New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showConfirmPw ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      placeholder="Re-enter new password"
                      className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-gray-50/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw(!showConfirmPw)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password Match Status */}
              {newPassword && confirmPassword && (
                <div className="text-xs">
                  {newPassword === confirmPassword ? (
                    <span className="text-emerald-600 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Passwords match
                    </span>
                  ) : (
                    <span className="text-red-500 font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> Passwords do not match
                    </span>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={updateProfileMutation.isPending || !currentPassword || !newPassword || newPassword !== confirmPassword}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm flex items-center gap-2 shadow-xs shadow-indigo-900/10 cursor-pointer disabled:cursor-not-allowed"
                >
                  {updateProfileMutation.isPending ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Updating password...
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      Update Password
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
