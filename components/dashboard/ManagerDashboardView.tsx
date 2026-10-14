"use client";

import React from "react";
import Link from "next/link";
import {
  Users,
  Phone,
  Clock,
  Calendar,
  DollarSign,
  TrendingUp,
  UserPlus,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Award,
  Filter,
  BarChart3,
  Flame,
} from "lucide-react";
import { KpiCard } from "./KpiCard";
import { formatCurrency, formatDateTime } from "@/lib/utils";

interface ManagerDashboardViewProps {
  metrics: any;
  period: "today" | "yesterday" | "week" | "month" | "custom" | string;
  periodLabel?: string;
  onSelectRep?: (repId: string) => void;
  selectedRepId?: string | null;
}

export function ManagerDashboardView({
  metrics,
  period,
  periodLabel,
  onSelectRep,
  selectedRepId,
}: ManagerDashboardViewProps) {
  const {
    unassignedLeadsCount = 0,
    totalCalls = 0,
    connectedCalls = 0,
    connectRate = 0,
    talkTimeMins = 0,
    todayCallbacksCount = 0,
    todayDemosCount = 0,
    activeDealsCount = 0,
    activePipelineValue = 0,
    wonDealsCount = 0,
    wonRevenueInPeriod = 0,
    dispositionMap = {},
    leaderboard = [],
    leadsByVertical = [],
    recentCalls = [],
    totalLeadsCount = 0,
  } = metrics || {};

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
      {/* 🚨 Lead Allocation Alert Banner */}
      {unassignedLeadsCount > 0 ? (
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-orange-500/15 border-2 border-amber-300 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-sm shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-amber-950">
                Action Required: {unassignedLeadsCount} Unassigned Leads in Pool
              </h3>
              <p className="text-xs text-amber-800 mt-0.5">
                Fresh imported leads are waiting in the unassigned pool. Distribute them across your sales representatives to keep queues active.
              </p>
            </div>
          </div>

          <Link
            href="/leads?repId=unassigned"
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-sm shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            Allocate Leads Now
          </Link>
        </div>
      ) : (
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-xs font-medium text-emerald-900">
              <strong>Lead Allocation Optimal:</strong> All incoming CRM leads are currently assigned to sales representatives.
            </p>
          </div>
          <Link
            href="/leads"
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 shrink-0"
          >
            View Leads Directory <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* 📊 Team Manager KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Unassigned Lead Pool"
          value={unassignedLeadsCount}
          subValue={unassignedLeadsCount > 0 ? "Requires distribution" : "Queue fully allocated"}
          icon={UserPlus}
          color={unassignedLeadsCount > 0 ? "amber" : "emerald"}
          badge={`Total CRM Leads: ${totalLeadsCount}`}
        />

        <KpiCard
          label={`Team Dials (${activePeriodLabel})`}
          value={totalCalls}
          subValue={`${connectedCalls} connected (${connectRate}% pickup)`}
          icon={Phone}
          color="blue"
          badge={`Team Talk Time: ${talkTimeMins}m`}
        />

        <KpiCard
          label="Team Pipeline Value"
          value={formatCurrency(activePipelineValue)}
          subValue={`${activeDealsCount} active quotes in negotiation`}
          icon={DollarSign}
          color="indigo"
          badge={`Won: ${formatCurrency(wonRevenueInPeriod)}`}
        />

        <KpiCard
          label="Demos & Commitments"
          value={todayDemosCount + todayCallbacksCount}
          subValue={`${wonDealsCount} deal(s) closed won`}
          icon={TrendingUp}
          color="purple"
          badge={`${todayDemosCount} Demos Scheduled`}
        />
      </div>

      {/* 🏆 Live Team Performance Leaderboard */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              Sales Team Performance Leaderboard ({activePeriodLabel})
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Live ranking of representatives by activity volume, call duration, and revenue conversion
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/reports"
              className="text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-xl border border-gray-200 transition flex items-center gap-1.5"
            >
              <BarChart3 className="w-3.5 h-3.5" /> Full EOD Report
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Representative</th>
                <th className="px-4 py-3">Total Dials</th>
                <th className="px-4 py-3">Talk Time</th>
                <th className="px-4 py-3">Demos Booked</th>
                <th className="px-4 py-3">Deals Won</th>
                <th className="px-5 py-3">Won Revenue</th>
                <th className="px-4 py-3 text-right">Drill-Down</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    No sales reps active or no dials recorded for this period yet.
                  </td>
                </tr>
              ) : (
                leaderboard.map((rep: any, idx: number) => {
                  const isTopPerformer = idx === 0 && rep.totalCalls > 0;
                  const isSelected = selectedRepId === rep.repId;

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
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                              idx === 0
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : idx === 1
                                ? "bg-slate-200 text-slate-700"
                                : idx === 2
                                ? "bg-orange-100 text-orange-800"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-bold text-gray-900 flex items-center gap-1.5">
                              {rep.repName}
                              {isTopPerformer && (
                                <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                              )}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 font-semibold text-gray-800">
                        {rep.totalCalls} calls
                      </td>

                      <td className="px-4 py-3.5 text-gray-600">
                        <span className="font-semibold text-gray-800">{rep.talkTimeMins}m</span>
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
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition border ${
                              isSelected
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            {isSelected ? "Clear Filter" : "Filter Rep"}
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

      {/* 2-Column Insights: Funnel & Verticals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Outcomes Distribution */}
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-5">
          <h3 className="text-base font-bold text-gray-900 mb-1">
            Team Call Outcomes ({activePeriodLabel})
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Aggregated call disposition distribution across all active representatives
          </p>

          <div className="space-y-3">
            {[
              { label: "Connected Conversations", count: dispositionMap["Connected"] || 0, color: "bg-emerald-500" },
              { label: "Ringing No Response (RNR)", count: dispositionMap["RNR"] || 0, color: "bg-amber-400" },
              { label: "Callbacks Promised", count: dispositionMap["Callback"] || 0, color: "bg-blue-500" },
              { label: "Demo Scheduled", count: dispositionMap["Demo Scheduled"] || 0, color: "bg-purple-500" },
              { label: "Not Interested", count: dispositionMap["Not Interested"] || 0, color: "bg-gray-400" },
              { label: "Invalid Number", count: dispositionMap["Invalid"] || 0, color: "bg-rose-400" },
            ].map((item) => {
              const percent = totalCalls > 0 ? Math.round((item.count / totalCalls) * 100) : 0;
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-gray-700">{item.label}</span>
                    <span className="text-gray-500 font-semibold">
                      {item.count} ({percent}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full transition-all duration-300`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Industry Verticals Interest */}
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-5">
          <h3 className="text-base font-bold text-gray-900 mb-1">
            Top Industry Verticals in Database
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Distribution of leads by business niche & industry category
          </p>

          {leadsByVertical.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">No vertical data recorded.</p>
          ) : (
            <div className="space-y-3">
              {leadsByVertical.map((v: any) => {
                const percent = totalLeadsCount > 0 ? Math.round((v.count / totalLeadsCount) * 100) : 0;
                return (
                  <div key={v.vertical} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-gray-800 font-semibold">{v.vertical}</span>
                      <span className="text-gray-500">
                        {v.count} leads ({percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, percent * 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
