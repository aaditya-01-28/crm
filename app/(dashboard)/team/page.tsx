"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Shield, Mail, Phone, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";

interface TeamUser {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  role: string;
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

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            Team Management
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage sales reps, managers, and ops team members
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Add Member
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {users.map((u) => (
            <div
              key={u.id}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-800 text-base">
                    {u.fullName}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    <span>{u.email}</span>
                  </div>
                  {u.phoneNumber && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      <span>{u.phoneNumber}</span>
                    </div>
                  )}
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                    ROLE_BADGES[u.role] || "bg-gray-100 text-gray-600"
                  }`}
                >
                  {ROLES.find((r) => r.value === u.role)?.label || u.role}
                </span>
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
            </div>
          ))}
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
