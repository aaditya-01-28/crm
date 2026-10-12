"use client";

import React from "react";
import { Calendar, User, RefreshCw, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  fullName: string;
  role: string;
  email: string;
}

interface DashboardHeaderProps {
  userName: string;
  userRole: string;
  period: "today" | "week" | "month";
  onPeriodChange: (p: "today" | "week" | "month") => void;
  selectedUserId: string | null;
  onUserChange: (id: string | null) => void;
  teamMembers: TeamMember[];
  canFilterUser: boolean;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

const ROLE_BADGES: Record<string, { label: string; style: string }> = {
  super_admin: { label: "Level 3 • Super Admin", style: "bg-purple-100 text-purple-800 border-purple-200" },
  sales_manager: { label: "Level 2 • Sales Manager", style: "bg-blue-100 text-blue-800 border-blue-200" },
  sales_rep: { label: "Level 1 • Sales Representative", style: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  accounts_ops: { label: "Support • Accounts & Ops", style: "bg-amber-100 text-amber-800 border-amber-200" },
};

export function DashboardHeader({
  userName,
  userRole,
  period,
  onPeriodChange,
  selectedUserId,
  onUserChange,
  teamMembers,
  canFilterUser,
  onRefresh,
  isRefreshing = false,
}: DashboardHeaderProps) {
  const roleBadge = ROLE_BADGES[userRole] || {
    label: userRole,
    style: "bg-gray-100 text-gray-700 border-gray-200",
  };

  const selectedMember = teamMembers.find((m) => m.id === selectedUserId);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      {/* Left: User Welcome & Role Badge */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span
            className={cn(
              "text-[11px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider",
              roleBadge.style
            )}
          >
            {roleBadge.label}
          </span>
          <span className="text-xs text-gray-400 font-medium">Textora Engage Operations</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
          Dashboard
          <span className="text-gray-400 font-normal text-lg">
            — Welcome, {userName}
          </span>
        </h1>
        {selectedMember && (
          <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5 font-medium">
            <span>Viewing activity filtered for: <strong>{selectedMember.fullName}</strong></span>
            <button
              onClick={() => onUserChange(null)}
              className="text-indigo-400 hover:text-indigo-800 ml-1 p-0.5"
              title="Clear user filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </p>
        )}
      </div>

      {/* Right: Time Period Filter & Employee Filter (Level 2 & 3) */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Employee Filter Dropdown (Level 2 & 3 only) */}
        {canFilterUser && (
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs">
            <User className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={selectedUserId || "all"}
              onChange={(e) =>
                onUserChange(e.target.value === "all" ? null : e.target.value)
              }
              className="bg-transparent font-semibold text-gray-700 outline-none cursor-pointer py-1 text-xs"
            >
              <option value="all">All Team Members (Aggregated)</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName} ({member.role === "sales_rep" ? "Rep" : "Manager"})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Time Period Tabs */}
        <div className="flex bg-gray-100/90 p-1 rounded-xl border border-gray-200/60 text-xs">
          <button
            onClick={() => onPeriodChange("today")}
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold transition",
              period === "today"
                ? "bg-white text-emerald-700 shadow-xs ring-1 ring-black/5"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            Today
          </button>
          <button
            onClick={() => onPeriodChange("week")}
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold transition",
              period === "week"
                ? "bg-white text-emerald-700 shadow-xs ring-1 ring-black/5"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            This Week
          </button>
          <button
            onClick={() => onPeriodChange("month")}
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold transition",
              period === "month"
                ? "bg-white text-emerald-700 shadow-xs ring-1 ring-black/5"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            This Month
          </button>
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition shadow-xs disabled:opacity-50"
          title="Refresh dashboard stats"
        >
          <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin text-emerald-600")} />
        </button>
      </div>
    </div>
  );
}
