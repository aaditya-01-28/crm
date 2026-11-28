"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, AlertTriangle, RefreshCw, CreditCard, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { useSession } from "@/components/layout/SessionProvider";
import { isAdmin, isSalesManager, isSalesRep, isManagerOrAdmin } from "@/lib/rbac";
import { DashboardHeader, type DashboardPeriod } from "@/components/dashboard/DashboardHeader";
import { RepDashboardView } from "@/components/dashboard/RepDashboardView";
import { ManagerDashboardView } from "@/components/dashboard/ManagerDashboardView";
import { AdminDashboardView } from "@/components/dashboard/AdminDashboardView";
import { formatCurrency, getISTDateRange, getISTDateString } from "@/lib/utils";

const getPresetDates = (preset: DashboardPeriod): { from: string; to: string } => {
  if (preset === "all") {
    const todayStr = getISTDateString();
    return { from: "2020-01-01", to: todayStr };
  }
  const { startOfPeriod, endOfPeriod } = getISTDateRange(preset);
  const from = getISTDateString(startOfPeriod);
  const to = getISTDateString(endOfPeriod);
  return { from, to };
};

export default function DashboardPage() {
  const { role, userName } = useSession();
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [customDateFrom, setCustomDateFrom] = useState(() => getPresetDates("today").from);
  const [customDateTo, setCustomDateTo] = useState(() => getPresetDates("today").to);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-stats", period, customDateFrom, customDateTo, selectedUserId],
    queryFn: async () => {
      const url = new URL("/api/dashboard/stats", window.location.origin);
      url.searchParams.set("period", period);
      if (period === "custom") {
        if (customDateFrom) url.searchParams.set("dateFrom", customDateFrom);
        if (customDateTo) url.searchParams.set("dateTo", customDateTo);
      }
      if (selectedUserId) {
        url.searchParams.set("userId", selectedUserId);
      }
      const res = await fetch(url.toString());
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load dashboard statistics");
      }
      return res.json();
    },
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000, // Real-time 15s auto-refresh
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["dialer-queue"] });
      toast.success("Dashboard metrics refreshed");
    } catch {
      toast.error("Failed to refresh dashboard");
    }
  };

  const handlePeriodChange = (newPeriod: DashboardPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod !== "custom") {
      const dates = getPresetDates(newPeriod);
      setCustomDateFrom(dates.from);
      setCustomDateTo(dates.to);
    }
  };

  const handleCustomDateFromChange = (newDate: string) => {
    setCustomDateFrom(newDate);
    setPeriod("custom");
  };

  const handleCustomDateToChange = (newDate: string) => {
    setCustomDateTo(newDate);
    setPeriod("custom");
  };

  const handleUserChange = (userId: string | null) => {
    setSelectedUserId(userId);
  };

  const handleSelectRep = (repId: string) => {
    setSelectedUserId(repId);
  };

  // Human-readable period label for widgets and KPI cards across all views
  const periodLabel =
    period === "all"
      ? "All Time"
      : period === "today"
      ? "Today"
      : period === "yesterday"
      ? "Yesterday"
      : period === "week"
      ? "This Week"
      : period === "month"
      ? "This Month"
      : customDateFrom && customDateTo
      ? customDateFrom === customDateTo
        ? customDateFrom
        : `${customDateFrom} to ${customDateTo}`
      : customDateFrom
      ? `From ${customDateFrom}`
      : "Custom Range";

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Role-Adaptive Dashboard Header & Filters (Dropdown for all levels) */}
      <DashboardHeader
        userName={userName || "Team Member"}
        userRole={role}
        period={period}
        onPeriodChange={handlePeriodChange}
        customDateFrom={customDateFrom}
        onCustomDateFromChange={handleCustomDateFromChange}
        customDateTo={customDateTo}
        onCustomDateToChange={handleCustomDateToChange}
        selectedUserId={selectedUserId}
        onUserChange={handleUserChange}
        teamMembers={data?.teamMembers || []}
        canFilterUser={isManagerOrAdmin(role)}
        onRefresh={handleRefresh}
        isRefreshing={isFetching}
      />

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-6 animate-pulse">
          {/* Top Banner Skeleton */}
          <div className="h-24 bg-gray-200/80 rounded-2xl border border-gray-200/50" />

          {/* KPI Cards Skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="h-32 bg-gray-200/70 rounded-2xl border border-gray-200/40" />
            <div className="h-32 bg-gray-200/70 rounded-2xl border border-gray-200/40" />
            <div className="h-32 bg-gray-200/70 rounded-2xl border border-gray-200/40" />
            <div className="h-32 bg-gray-200/70 rounded-2xl border border-gray-200/40" />
          </div>

          {/* Content Grids Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-96 bg-gray-200/60 rounded-2xl border border-gray-200/30" />
            <div className="h-96 bg-gray-200/60 rounded-2xl border border-gray-200/30" />
          </div>
        </div>
      )}

      {/* Error State */}
      {isError && !isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-red-900">Failed to load statistics</h3>
          <p className="text-xs text-red-700 max-w-md mx-auto">
            {(error as Error)?.message || "A network or server error occurred while computing metrics."}
          </p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Level-Adaptive Views */}
      {!isLoading && data && (
        <>
          {/* Level 3: Super Admin Command Center */}
          {isAdmin(role) && (
            <AdminDashboardView
              metrics={data.metrics}
              period={period}
              periodLabel={periodLabel}
              onSelectRep={handleSelectRep}
              selectedRepId={selectedUserId}
            />
          )}

          {/* Level 2: Sales Manager / Team Lead Operations Hub */}
          {isSalesManager(role) && (
            <ManagerDashboardView
              metrics={data.metrics}
              period={period}
              periodLabel={periodLabel}
              onSelectRep={handleSelectRep}
              selectedRepId={selectedUserId}
            />
          )}

          {/* Level 1: Sales Representative Personal Cockpit */}
          {isSalesRep(role) && (
            <RepDashboardView
              metrics={data.metrics}
              period={period}
              periodLabel={periodLabel}
            />
          )}

          {/* Accounts & Operations Payment Verification Summary */}
          {!isAdmin(role) && !isSalesManager(role) && !isSalesRep(role) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-amber-200 p-5 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                    Pending Verification
                  </span>
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {data.metrics?.pendingPaymentsCount ?? 0} Deals
                </p>
                <p className="text-xs text-gray-500">
                  Value: {formatCurrency(data.metrics?.pendingPaymentsValue ?? 0)}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Verified Revenue ({periodLabel})
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-emerald-700">
                  {formatCurrency(data.metrics?.verifiedRevenue ?? 0)}
                </p>
                <p className="text-xs text-gray-500">
                  All-time verified: {formatCurrency(data.metrics?.allTimeVerifiedRevenue ?? 0)}
                </p>
              </div>

              <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                    <CreditCard className="w-4 h-4" />
                    Operations Queue
                  </div>
                  <p className="text-sm text-slate-300">
                    Review receipts and provision customer credits from the verification queue.
                  </p>
                </div>
                <Link
                  href="/payments"
                  className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2.5 px-4 rounded-xl transition"
                >
                  Open Payments Queue
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
