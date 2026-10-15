"use client";

import React from "react";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  Award,
  Users,
  Database,
  Phone,
  BarChart3,
  CreditCard,
  UserCheck,
  CheckCircle2,
  FileSpreadsheet,
  ArrowRight,
  ShieldAlert,
  Flame,
  PieChart,
} from "lucide-react";
import { KpiCard } from "./KpiCard";
import { formatCurrency, formatDateTime } from "@/lib/utils";

interface AdminDashboardViewProps {
  metrics: any;
  period: "today" | "yesterday" | "week" | "month" | "custom" | string;
  periodLabel?: string;
  onSelectRep?: (repId: string) => void;
  selectedRepId?: string | null;
}

export function AdminDashboardView({
  metrics,
  period,
  periodLabel,
  onSelectRep,
  selectedRepId,
}: AdminDashboardViewProps) {
  const [roleFilter, setRoleFilter] = React.useState<"all" | "sales_manager" | "sales_rep">("all");

  const {
    verifiedRevenue = 0,
    wonRevenueInPeriod = 0,
    activePipelineValue = 0,
    activeDealsCount = 0,
    wonDealsCount = 0,
    winRate = 0,
    totalCalls = 0,
    connectRate = 0,
    talkTimeMins = 0,
    totalLeadsCount = 0,
    unassignedLeadsCount = 0,
    leaderboard = [],
    leadsBySource = [],
    leadsByStatus = [],
    recentCalls = [],
    pendingPaymentsCount = 0,
    pendingPaymentsValue = 0,
  } = metrics || {};

  const managerCount = leaderboard.filter((r: any) => r.repRole === "sales_manager").length;
  const repCount = leaderboard.filter((r: any) => r.repRole !== "sales_manager").length;
  const filteredLeaderboard = leaderboard.filter((r: any) => {
    if (roleFilter === "sales_manager") return r.repRole === "sales_manager";
    if (roleFilter === "sales_rep") return r.repRole !== "sales_manager";
    return true;
  });

  const activePeriodLabel =
    periodLabel ||
    (period === "today"
      ? "Today"
      : period === "yesterday"
      ? "Yesterday"
      : period === "week"
      ? "This Week"
      : period === "month"
      ? "This Month"
      : "Custom Range");

  return (
    <div className="space-y-6">
      {/* 💳 Executive Financial & Growth KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={`Revenue Inflow (${activePeriodLabel})`}
          value={formatCurrency(verifiedRevenue > 0 ? verifiedRevenue : wonRevenueInPeriod)}
          subValue={`${wonDealsCount} closed deal(s) won`}
          icon={DollarSign}
          color="emerald"
          badge={`Won Volume: ${formatCurrency(wonRevenueInPeriod)}`}
        />

        <KpiCard
          label="Open Pipeline Value"
          value={formatCurrency(activePipelineValue)}
          subValue={`${activeDealsCount} live quotes in negotiation`}
          icon={TrendingUp}
          color="blue"
          badge={`Avg Ticket: ${activeDealsCount > 0 ? formatCurrency(Math.round(activePipelineValue / activeDealsCount)) : "₹0"}`}
        />

        <KpiCard
          label="Executive Win Rate"
          value={`${winRate}%`}
          subValue={`${wonDealsCount} won / ${wonDealsCount + (metrics.lostDealsCount || 0)} decided`}
          icon={Award}
          color="purple"
          badge="Conversion Efficiency"
        />

        <KpiCard
          label="Total Database Leads"
          value={totalLeadsCount}
          subValue={
            unassignedLeadsCount > 0
              ? `⚠️ ${unassignedLeadsCount} unassigned in pool`
              : "All leads assigned to reps"
          }
          icon={Database}
          color={unassignedLeadsCount > 0 ? "amber" : "indigo"}
          badge={`Team Dials: ${totalCalls}`}
        />
      </div>

      {/* ⚡ Executive Control Center & Quick Actions */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-5 shadow-sm border border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            Executive Quick Controls
          </h3>
          <p className="text-xs text-slate-300 mt-0.5">
            Manage your sales operations, audit team allocations, and verify incoming receipts
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/team"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl border border-slate-600 transition flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            Manage Team
          </Link>
          <Link
            href="/leads"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl border border-slate-600 transition flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Import & Leads
          </Link>
          <Link
            href="/reports"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl border border-slate-600 transition flex items-center gap-1.5"
          >
            <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
            EOD Reports
          </Link>
          <Link
            href="/payments"
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Payments ({pendingPaymentsCount} pending)
          </Link>
        </div>
      </div>

      {/* 🏆 Sales Organization Leaderboard */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              Workforce Conversion & Leaderboard ({activePeriodLabel})
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Live ranking of sales representatives & managers by output volume, call talk time, and deal closures
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Role Filter Tabs (All / Level 2 Managers / Level 1 Reps) */}
            <div className="flex items-center bg-gray-100 p-0.5 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setRoleFilter("all")}
                className={`px-2.5 py-1 rounded-lg transition ${
                  roleFilter === "all"
                    ? "bg-white text-gray-900 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                All Team ({leaderboard.length})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("sales_manager")}
                className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 ${
                  roleFilter === "sales_manager"
                    ? "bg-white text-blue-800 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Level 2 Managers ({managerCount})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("sales_rep")}
                className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 ${
                  roleFilter === "sales_rep"
                    ? "bg-white text-emerald-800 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Level 1 Reps ({repCount})
              </button>
            </div>

            {selectedRepId && onSelectRep && (
              <button
                onClick={() => onSelectRep("")}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200"
              >
                Reset to All Team View
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Team Member / Role</th>
                <th className="px-4 py-3">Total Calls</th>
                <th className="px-4 py-3">Talk Time</th>
                <th className="px-4 py-3">Demos Booked</th>
                <th className="px-4 py-3">Deals Won</th>
                <th className="px-5 py-3">Won Revenue</th>
                <th className="px-4 py-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLeaderboard.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    No team members recorded for this filter.
                  </td>
                </tr>
              ) : (
                filteredLeaderboard.map((rep: any, idx: number) => {
                  const isTop = idx === 0 && rep.totalCalls > 0;
                  const isSelected = selectedRepId === rep.repId;
                  const isManager = rep.repRole === "sales_manager";

                  return (
                    <tr
                      key={rep.repId}
                      className={`hover:bg-gray-50/80 transition ${
                        isSelected ? "bg-indigo-50/50" : ""
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 ${
                              idx === 0
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-900 flex items-center gap-1.5">
                              {rep.repName}
                              {isTop && <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />}
                            </span>
                            {isManager ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                                Level 2 • Manager
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Level 1 • Rep
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 font-semibold text-gray-800">
                        {rep.totalCalls} dials
                      </td>

                      <td className="px-4 py-3.5 text-gray-600 font-medium">
                        {rep.talkTimeMins} mins
                      </td>

                      <td className="px-4 py-3.5 text-purple-700 font-semibold">
                        {rep.demosBooked}
                      </td>

                      <td className="px-4 py-3.5 text-emerald-700 font-semibold">
                        {rep.wonDeals}
                      </td>

                      <td className="px-5 py-3.5 font-bold text-gray-900">
                        {formatCurrency(rep.wonRevenue)}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        {onSelectRep && (
                          <button
                            onClick={() => onSelectRep(isSelected ? "" : rep.repId)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition border cursor-pointer ${
                              isSelected
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : isManager
                                ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            {isSelected ? "Clear" : isManager ? "Filter Manager" : "Filter Rep"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2-Column Sourcing & Quality ROI Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Sourcing Channel Volume */}
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-5">
          <h3 className="text-base font-bold text-gray-900 mb-1">
            Lead Acquisition Channels
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Volume of leads acquired per distribution channel / batch origin
          </p>

          {leadsBySource.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">No lead sources recorded.</p>
          ) : (
            <div className="space-y-3">
              {leadsBySource.map((s: any) => {
                const percent = totalLeadsCount > 0 ? Math.round((s.count / totalLeadsCount) * 100) : 0;
                return (
                  <div key={s.source} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-gray-800 font-semibold">{s.source}</span>
                      <span className="text-gray-500">
                        {s.count} leads ({percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Lead Status Health Distribution */}
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-5">
          <h3 className="text-base font-bold text-gray-900 mb-1">
            Database Status Health
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            High-level distribution of database records across current funnel statuses
          </p>

          <div className="space-y-3">
            {leadsByStatus.slice(0, 6).map((item: any) => {
              const percent = totalLeadsCount > 0 ? Math.round((item.count / totalLeadsCount) * 100) : 0;
              const isPositive = item.status === "won" || item.status === "demo_scheduled" || item.status === "deal_created";
              const isNegative = item.status === "not_interested" || item.status === "invalid" || item.status === "lost";

              return (
                <div key={item.status} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-gray-800 capitalize font-medium">
                      {item.status.replace(/_/g, " ")}
                    </span>
                    <span className="text-gray-500 font-semibold">
                      {item.count} ({percent}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isPositive ? "bg-emerald-500" : isNegative ? "bg-rose-400" : "bg-blue-400"
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
