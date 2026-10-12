"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Shield, Mail, Phone, X, CheckCircle2, Ban, Globe, ShieldAlert } from "lucide-react";
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

async function fetchTeam(): Promise<{ users: TeamUser[] }> {
  const res = await fetch("/api/team");
  if (!res.ok) throw new Error("Failed to load team");
  return res.json();
}

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { userId: currentUserId } = useSession();
  const isAdmin = useIsAdmin();

  const [showAddModal, setShowAddModal] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("sales_rep");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: fetchTeam,
  });

  const users = data?.users || [];

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

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            Team Management
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage sales reps, managers, regional language profiles, and access control
          </p>
        </div>
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

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            const spokenLangs = formatLanguageLabels(u.language);

            return (
              <div
                key={u.id}
                className={`bg-white rounded-xl border p-5 shadow-sm space-y-3 transition ${
                  u.isActive
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
                  <div className="border-t border-gray-100 pt-3 flex items-center justify-between gap-2">
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

                    {/* Block / Unblock Toggle */}
                    {isSelf ? (
                      <span className="text-[11px] text-gray-400 italic">Self Account</span>
                    ) : u.isActive ? (
                      <button
                        type="button"
                        disabled={toggleBlockMutation.isPending}
                        onClick={() => handleToggleBlock(u.id, false, u.fullName)}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 text-red-700 hover:text-white bg-red-50 hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg font-semibold transition cursor-pointer disabled:opacity-50"
                        title="Block this user from logging into the CRM"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Block User</span>
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
                        <span>Unblock User</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
