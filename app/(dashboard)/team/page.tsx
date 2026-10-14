"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Shield,
  Mail,
  Phone,
  X,
  CheckCircle2,
  Ban,
  Globe,
  KeyRound,
  ShieldAlert,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  ChevronRight,
  AlertCircle,
  Clock,
  RotateCw,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, formatLanguageLabels } from "@/lib/utils";
import { useSession, useIsAdmin } from "@/components/layout/SessionProvider";

interface TeamUser {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  role: string;
  language?: string | null;
  isActive: boolean;
  createdAt: string;
  _count: {
    assignedLeads: number;
    callLogs: number;
    deals: number;
  };
}

interface PasswordRequestItem {
  id: string;
  userId: string;
  status: "pending" | "resolved" | "rejected";
  requestedAt: string;
  resolvedAt: string | null;
  userNotes: string | null;
  adminNotes: string | null;
  fullName: string;
  email: string;
  role: string;
  phoneNumber: string | null;
  isActive: boolean;
}

const ROLES = [
  { value: "sales_rep", label: "Sales Representative" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "accounts_ops", label: "Accounts & Operations" },
  { value: "super_admin", label: "Super Admin" },
];

const ROLE_BADGES: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700 border-purple-200",
  sales_manager: "bg-blue-100 text-blue-700 border-blue-200",
  sales_rep: "bg-green-100 text-green-700 border-green-200",
  accounts_ops: "bg-orange-100 text-orange-700 border-orange-200",
};

function generateSecurePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pwd = "Textora@";
  for (let i = 0; i < 4; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd + "!";
}

async function fetchTeam(): Promise<{ users: TeamUser[] }> {
  const res = await fetch("/api/team");
  if (!res.ok) throw new Error("Failed to load team");
  return res.json();
}

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { userId: currentUserId } = useSession();
  const isAdmin = useIsAdmin();

  // Add Member Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("sales_rep");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // Super Admin Reset Password Modal State
  const [showResetModal, setShowResetModal] = useState(false);
  const [targetUser, setTargetUser] = useState<{ id: string; fullName: string; email: string; role: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [resetSuccessData, setResetSuccessData] = useState<{ email: string; password: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Review Requests Modal State
  const [showRequestsModal, setShowRequestsModal] = useState(false);

  // Edit Member Modal State (Level 3 Super Admin)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUser, setEditUser] = useState<TeamUser | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("sales_rep");

  // Query team
  const { data, isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: fetchTeam,
  });

  // Query password reset requests for Super Admin
  const { data: requestsData } = useQuery<{ requests: PasswordRequestItem[]; pendingCount: number }>({
    queryKey: ["password-requests"],
    queryFn: async () => {
      const res = await fetch("/api/team/password-requests");
      if (!res.ok) return { requests: [], pendingCount: 0 };
      return res.json();
    },
    enabled: isAdmin,
    refetchInterval: 15000,
  });

  const users = data?.users || [];
  const passwordRequests = requestsData?.requests || [];
  const pendingRequestsCount = requestsData?.pendingCount || 0;

  // Toggle user block / unblock mutation
  const toggleBlockMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const res = await fetch(`/api/team/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to update user status");
      return resData;
    },
    onSuccess: (data, vars) => {
      toast.success(
        vars.isActive
          ? "User account unlocked & access restored ✅"
          : "User blocked from accessing CRM console 🚫"
      );
      queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update user access");
    },
  });

  // Change user role mutation
  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const res = await fetch(`/api/team/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to update role");
      return resData;
    },
    onSuccess: () => {
      toast.success("User role updated successfully ✅");
      queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update user role");
    },
  });

  // Admin direct reset password mutation
  const adminResetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const res = await fetch(`/api/team/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to reset password");
      return resData;
    },
    onSuccess: (data, vars) => {
      toast.success(`Password for ${targetUser?.fullName} updated successfully! ✅`);
      setResetSuccessData({
        email: targetUser?.email || "",
        password: vars.newPassword,
        name: targetUser?.fullName || "",
      });
      queryClient.invalidateQueries({ queryKey: ["team"] });
      queryClient.invalidateQueries({ queryKey: ["password-requests"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to reset user password");
    },
  });

  // Reject password request mutation
  const rejectRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch("/api/team/password-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action: "reject" }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to dismiss request");
      return resData;
    },
    onSuccess: () => {
      toast.success("Password reset request dismissed");
      queryClient.invalidateQueries({ queryKey: ["password-requests"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to dismiss request");
    },
  });

  // Update team member details mutation (Level 3 Super Admin)
  const updateMemberDetailsMutation = useMutation({
    mutationFn: async ({
      userId,
      fullName,
      email,
      phoneNumber,
      role,
    }: {
      userId: string;
      fullName: string;
      email: string;
      phoneNumber: string | null;
      role: string;
    }) => {
      const res = await fetch(`/api/team/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, phoneNumber, role }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to update team member details");
      return resData;
    },
    onSuccess: (data, vars) => {
      toast.success(`Details for ${vars.fullName} updated successfully! ✅`);
      setShowEditModal(false);
      setEditUser(null);
      queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update team member details");
    },
  });

  function handleOpenEditModal(u: TeamUser) {
    setEditUser(u);
    setEditFullName(u.fullName);
    setEditEmail(u.email);
    setEditPhone(u.phoneNumber || "");
    setEditRole(u.role);
    setShowEditModal(true);
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          password,
          role,
          phoneNumber: phone || null,
        }),
      });
      const resData = await res.json();
      if (!res.ok) {
        toast.error(resData.error || "Failed to create user");
        return;
      }
      toast.success(`User ${fullName} added successfully!`);
      setShowAddModal(false);
      setFullName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setRole("sales_rep");
      queryClient.invalidateQueries({ queryKey: ["team"] });
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenResetPasswordModal(user: { id: string; fullName: string; email: string; role: string }) {
    setTargetUser(user);
    setNewPassword(generateSecurePassword());
    setResetSuccessData(null);
    setCopied(false);
    setShowRequestsModal(false); // Close requests modal so reset modal is immediately visible in foreground
    setShowResetModal(true);
  }

  function handleToggleBlock(userId: string, newActiveState: boolean, userName: string) {
    const actionWord = newActiveState ? "unblock" : "block";
    const confirmed = window.confirm(
      `Are you sure you want to ${actionWord} ${userName}? ${
        !newActiveState
          ? "They will immediately lose access and will not be able to log in to the CRM."
          : "They will be able to log in and resume work."
      }`
    );
    if (!confirmed) return;
    toggleBlockMutation.mutate({ userId, isActive: newActiveState });
  }

  function handleRoleChange(userId: string, newRole: string) {
    changeRoleMutation.mutate({ userId, newRole });
  }

  function handleCopyCredentials() {
    if (!resetSuccessData) return;
    const text = `Textora CRM Login Credentials:\nEmail: ${resetSuccessData.email}\nPassword: ${resetSuccessData.password}\nLogin URL: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Credentials copied to clipboard! 📋");
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            Team Management
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage sales reps, managers, regional language profiles, and access credentials
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {isAdmin && pendingRequestsCount > 0 && (
            <button
              onClick={() => setShowRequestsModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition shadow-xs cursor-pointer animate-pulse"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{pendingRequestsCount} Reset Requests</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Member
            </button>
          )}
        </div>
      </div>

      {/* Password Reset Requests Alert Banner for Super Admin */}
      {isAdmin && pendingRequestsCount > 0 && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-300 shadow-xs flex items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-amber-950 text-sm">
                  {pendingRequestsCount} Pending Password Reset {pendingRequestsCount === 1 ? "Request" : "Requests"}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-200 text-amber-900">
                  Super Admin Action Required
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                Level 1 or Level 2 team members have requested password assistance. Per security policy, only Level 3 Super Admins can update their credentials.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowRequestsModal(true)}
            className="px-3.5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span>Review & Reset</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Team Cards Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            const spokenLangs = formatLanguageLabels(u.language);
            const userPendingRequest = passwordRequests.find(
              (r) => r.userId === u.id && r.status === "pending"
            );

            return (
              <div
                key={u.id}
                className={`bg-white rounded-xl border p-5 shadow-sm space-y-3 transition ${
                  userPendingRequest
                    ? "border-amber-300 ring-2 ring-amber-200/80 bg-amber-50/10"
                    : u.isActive
                    ? "border-gray-200"
                    : "border-red-200 bg-red-50/20 ring-1 ring-red-200/50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-800 text-base">
                        {u.fullName}
                      </h3>
                      {isSelf && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          You
                        </span>
                      )}
                      {userPendingRequest && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                          <KeyRound className="w-3 h-3 text-amber-600" />
                          Reset Requested
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{u.email}</span>
                    </div>

                    {u.phoneNumber && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span>{u.phoneNumber}</span>
                      </div>
                    )}

                    {spokenLangs ? (
                      <div className="flex items-center gap-1 text-[11px] text-gray-600 pt-0.5">
                        <Globe className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                          {spokenLangs}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                        ROLE_BADGES[u.role] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {ROLES.find((r) => r.value === u.role)?.label || u.role}
                    </span>

                    {/* Active vs Blocked Badge */}
                    {u.isActive ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                        <Ban className="w-3 h-3 text-red-600" />
                        Blocked / Suspended
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-center text-xs">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-400 font-medium">Assigned Leads</p>
                    <p className="text-sm font-bold text-gray-700">
                      {u._count.assignedLeads}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-400 font-medium">Calls Logged</p>
                    <p className="text-sm font-bold text-gray-700">
                      {u._count.callLogs}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-400 font-medium">Deals Created</p>
                    <p className="text-sm font-bold text-gray-700">
                      {u._count.deals}
                    </p>
                  </div>
                </div>

                {/* Level 3 Super Admin Access Controls */}
                {isAdmin && (
                  <div className="border-t border-gray-100 pt-3 flex flex-wrap items-center justify-between gap-2">
                    {/* Role selector */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-gray-500">Role:</span>
                      <select
                        value={u.role}
                        disabled={isSelf || changeRoleMutation.isPending}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className="text-xs px-2 py-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg font-medium text-gray-800 outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        title={isSelf ? "Cannot change your own role" : "Modify user role"}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Super Admin Edit Member Details Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(u)}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg font-semibold transition cursor-pointer"
                        title="Edit member details (Name, Email, Phone)"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                        <span>Edit</span>
                      </button>

                      {/* Super Admin Direct Password Reset Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenResetPasswordModal(u)}
                        className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                          userPendingRequest
                            ? "bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                            : "text-indigo-700 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-200 hover:border-indigo-600"
                        }`}
                        title="Set new password for this user"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{userPendingRequest ? "Resolve Reset" : "Reset Password"}</span>
                      </button>

                      {/* Block / Unblock Toggle */}
                      {isSelf ? (
                        <span className="text-[11px] text-gray-400 italic px-1">Self</span>
                      ) : u.isActive ? (
                        <button
                          type="button"
                          disabled={toggleBlockMutation.isPending}
                          onClick={() => handleToggleBlock(u.id, false, u.fullName)}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 text-red-700 hover:text-white bg-red-50 hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg font-semibold transition cursor-pointer disabled:opacity-50"
                          title="Block this user from logging into the CRM"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Block</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={toggleBlockMutation.isPending}
                          onClick={() => handleToggleBlock(u.id, true, u.fullName)}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 text-emerald-700 hover:text-white bg-emerald-50 hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 rounded-lg font-semibold transition cursor-pointer disabled:opacity-50"
                          title="Unblock and restore login access"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Unblock</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Password Reset Modal (Level 3 Super Admin Control) */}
      {showResetModal && targetUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[70] p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 px-6 py-4 flex items-center justify-between text-white border-b border-indigo-500/20">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-sm tracking-wide">
                  Reset Password: {targetUser.fullName}
                </h3>
              </div>
              <button
                onClick={() => setShowResetModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {resetSuccessData ? (
                <div className="space-y-4 text-center py-2 animate-in fade-in duration-150">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-base">
                      Password Updated Successfully!
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      New credentials for <strong>{resetSuccessData.name}</strong> are ready.
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-left text-xs space-y-2">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                        Login Email
                      </span>
                      <span className="font-semibold text-slate-800">{resetSuccessData.email}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                        New Password
                      </span>
                      <span className="font-mono font-bold text-indigo-700 text-sm select-all">
                        {resetSuccessData.password}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCredentials}
                      className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copied to Clipboard!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy Credentials</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResetModal(false)}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newPassword || newPassword.length < 6) {
                      toast.error("Password must be at least 6 characters.");
                      return;
                    }
                    adminResetPasswordMutation.mutate({
                      userId: targetUser.id,
                      newPassword,
                    });
                  }}
                  className="space-y-4"
                >
                  <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3 text-xs text-indigo-900 space-y-1">
                    <p className="font-semibold flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-indigo-600" />
                      Level 3 Super Admin Privilege
                    </p>
                    <p className="text-[11px] text-indigo-800 leading-relaxed">
                      You are manually assigning a new password for <strong>{targetUser.fullName}</strong> ({targetUser.email}). Any open reset requests for this user will automatically be marked resolved.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        New Password <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setNewPassword(generateSecurePassword())}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCw className="w-3 h-3" />
                        Generate Strong
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showNewPw ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        placeholder="Minimum 6 characters"
                        className="w-full pl-3.5 pr-10 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-gray-50/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw(!showNewPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setShowResetModal(false)}
                      className="px-4 py-2.5 text-xs text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={adminResetPasswordMutation.isPending}
                      className="px-5 py-2.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold rounded-xl transition flex items-center gap-1.5 shadow-sm shadow-indigo-900/10 cursor-pointer"
                    >
                      {adminResetPasswordMutation.isPending ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-3.5 h-3.5" />
                          Update Password
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

      {/* MODAL 2: Review Password Reset Requests Modal */}
      {showRequestsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-100">
            <div className="bg-gradient-to-r from-slate-900 to-amber-950 px-6 py-4 flex items-center justify-between text-white border-b border-amber-500/20 shrink-0">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm tracking-wide">
                  Password Reset Requests ({passwordRequests.length})
                </h3>
              </div>
              <button
                onClick={() => setShowRequestsModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3.5 flex-1">
              {passwordRequests.length === 0 ? (
                <div className="text-center py-12 text-gray-400 space-y-2">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 opacity-80" />
                  <p className="font-semibold text-gray-700 text-sm">No Password Reset Requests</p>
                  <p className="text-xs text-gray-400">
                    No Level 1 or Level 2 team members currently have pending password reset requests.
                  </p>
                </div>
              ) : (
                passwordRequests.map((req) => (
                  <div
                    key={req.id}
                    className={`p-4 rounded-xl border transition space-y-2.5 ${
                      req.status === "pending"
                        ? "bg-amber-50/40 border-amber-200 ring-1 ring-amber-200/60"
                        : "bg-gray-50/60 border-gray-200 opacity-75"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-gray-900 text-sm">
                            {req.fullName}
                          </h4>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                              ROLE_BADGES[req.role] || "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {ROLES.find((r) => r.value === req.role)?.label || req.role}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                              req.status === "pending"
                                ? "bg-amber-100 text-amber-800"
                                : req.status === "resolved"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {req.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{req.email}</p>
                      </div>
                      <div className="text-right text-[11px] text-gray-400 shrink-0">
                        <span className="flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3" />
                          {formatDateTime(req.requestedAt)}
                        </span>
                      </div>
                    </div>

                    {req.userNotes && (
                      <div className="bg-white p-2.5 rounded-lg border border-gray-200 text-xs text-gray-700">
                        <span className="font-semibold text-gray-500 text-[10px] block uppercase">User Note:</span>
                        {req.userNotes}
                      </div>
                    )}

                    {req.status === "pending" && (
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-200/60">
                        <button
                          type="button"
                          disabled={rejectRequestMutation.isPending}
                          onClick={() => rejectRequestMutation.mutate(req.id)}
                          className="px-3 py-1.5 text-xs text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg font-medium transition cursor-pointer"
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleOpenResetPasswordModal({
                              id: req.userId,
                              fullName: req.fullName,
                              email: req.email,
                              role: req.role,
                            });
                          }}
                          className="px-3.5 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Set New Password</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowRequestsModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Edit Member Details Modal (Level 3 Super Admin Control) */}
      {showEditModal && editUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 flex items-center justify-between text-white border-b border-slate-700/50">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm tracking-wide">
                  Edit Member: {editUser.fullName}
                </h3>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMemberDetailsMutation.mutate({
                  userId: editUser.id,
                  fullName: editFullName.trim(),
                  email: editEmail.trim(),
                  phoneNumber: editPhone.trim() || null,
                  role: editRole,
                });
              }}
              className="p-6 space-y-4"
            >
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-800 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  Level 3 Super Admin Privilege
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  You can update the member&apos;s name, login email address, and direct phone / calling line.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1 block">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  required
                  placeholder="Full Name"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-gray-50/50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1 block">
                  Work Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    required
                    placeholder="name@company.com"
                    className="w-full pl-9 pr-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-gray-50/50"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Used as their Textora CRM sign-in account.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1 block">
                  Contact Phone / Calling Line
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full pl-9 pr-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-gray-50/50"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Primary number for outbound calling in Smart Dialer and SMS routing.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1 block">
                  Assigned System Role
                </label>
                <select
                  value={editRole}
                  disabled={editUser.id === currentUserId}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-gray-50/50 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {editUser.id === currentUserId && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    You cannot change your own Super Admin role.
                  </p>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2.5 text-xs text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMemberDetailsMutation.isPending}
                  className="px-5 py-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold rounded-xl transition flex items-center gap-1.5 shadow-sm shadow-emerald-900/10 cursor-pointer"
                >
                  {updateMemberDetailsMutation.isPending ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Add Team Member</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="e.g. Ramesh Verma"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="ramesh@textorasms.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Password *
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Role *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Phone Number (optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
