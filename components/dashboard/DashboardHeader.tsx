"use client";

import React from "react";
import { Calendar, User, RefreshCw, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardPeriod = "all" | "today" | "yesterday" | "week" | "month" | "custom";

interface TeamMember {
  id: string;
  fullName: string;
  role: string;
  email: string;
}

interface DashboardHeaderProps {
  userName: string;
  userRole: string;
  period: DashboardPeriod;
  onPeriodChange: (p: DashboardPeriod) => void;
  customDateFrom?: string;
  onCustomDateFromChange?: (date: string) => void;
  customDateTo?: string;
  onCustomDateToChange?: (date: string) => void;
  selectedUserId: string | null;
  onUserChange: (id: string | null) => void;
  teamMembers: TeamMember[];
  canFilterUser: boolean;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

const ROLE_BADGES: Record<string, { label: string; style: string }> = {
  super_admin: { label: "Level 3 · Super Admin", style: "bg-gray-100 text-gray-700 border-gray-200" },
  sales_manager: { label: "Level 2 · Sales Manager", style: "bg-gray-100 text-gray-700 border-gray-200" },
  sales_rep: { label: "Level 1 · Sales Representative", style: "bg-emerald-50 text-emerald-700 border-emerald-200/80" },
  accounts_ops: { label: "Accounts & Ops", style: "bg-gray-100 text-gray-700 border-gray-200" },
};

export function DashboardHeader({
  userName,
  userRole,
  period,
  onPeriodChange,
  customDateFrom = "",
  onCustomDateFromChange,
  customDateTo = "",
  onCustomDateToChange,
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
    <div className="bg-white rounded-xl border border-gray-200/90 p-5 shadow-xs mb-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
      {/* Left: Context & Role */}
      <div className="space-y-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-md border",
              roleBadge.style
            )}
          >
            {roleBadge.label}
          </span>
          <span className="text-xs text-gray-500">Textora Engage Operations</span>
        </div>
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h1 className="text-2xl font-medium tracking-tight text-gray-900">
            Dashboard
          </h1>
          <span className="text-sm text-gray-500">
            {userName}
          </span>
        </div>
        {selectedMember && (
          <p className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5 font-medium mt-1">
            <span>
              Viewing: <strong className="font-medium text-gray-900">{selectedMember.fullName}</strong>{" "}
              <span className="text-xs font-medium px-1.5 py-0.5 rounded border bg-white text-gray-700 border-gray-200">
                {selectedMember.role === "sales_manager" ? "Level 2 · Manager" : "Level 1 · Rep"}
              </span>
            </span>
            <button
              onClick={() => onUserChange(null)}
              className="text-gray-400 hover:text-gray-700 ml-1 p-0.5 cursor-pointer transition-colors duration-150"
              title="Clear user filter"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </p>
        )}
      </div>

      {/* Right: Time Period Dropdown Filter & Employee Filter */}
      <div className="flex items-center gap-2 flex-wrap justify-start xl:justify-end">
        {/* Employee Filter Dropdown (Level 2 & 3 only) */}
        {canFilterUser && (
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs">
            <User className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <select
              value={selectedUserId || "all"}
              onChange={(e) =>
                onUserChange(e.target.value === "all" ? null : e.target.value)
              }
              className="bg-transparent font-semibold text-gray-700 outline-none cursor-pointer py-1 text-xs pr-1"
              title="Filter statistics by employee"
            >
              <option value="all">All Team Members</option>
              {teamMembers.some((m) => m.role === "sales_manager") && (
                <optgroup label="Level 2 • Sales Managers">
                  {teamMembers
                    .filter((m) => m.role === "sales_manager")
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.fullName} (Manager)
                      </option>
                    ))}
                </optgroup>
              )}
              {teamMembers.some((m) => m.role === "sales_rep") && (
                <optgroup label="Level 1 • Sales Representatives">
                  {teamMembers
                    .filter((m) => m.role === "sales_rep")
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.fullName} (Rep)
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>
        )}

        {/* Time Period Dropdown Filter */}
        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs">
          <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <select
            value={period}
            onChange={(e) => onPeriodChange(e.target.value as DashboardPeriod)}
            className="bg-transparent font-semibold text-gray-800 outline-none cursor-pointer py-1 text-xs pr-1"
            title="Filter statistics by period"
          >
            <option value="all">All Time (Lifetime CRM)</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">This Week (Last 7 Days)</option>
            <option value="month">This Month (Last 30 Days)</option>
            <option value="custom">Custom Date Range</option>
          </select>
        </div>

        {/* Date Range Picker (shown when Custom Date Range is active) */}
        {period === "custom" && (
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-gray-500">From:</span>
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => onCustomDateFromChange?.(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-emerald-500 font-medium cursor-pointer"
                title="Start Date"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-gray-500">To:</span>
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => onCustomDateToChange?.(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-emerald-500 font-medium cursor-pointer"
                title="End Date"
              />
            </div>
          </div>
        )}

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:text-gray-900 transition shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
          title="Refresh dashboard stats"
        >
          <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin text-emerald-600")} />
        </button>
      </div>
    </div>
  );
}
