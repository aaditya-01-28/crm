"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useSession } from "@/components/layout/SessionProvider";
import { isAdmin, isSalesManager, isSalesRep, isManagerOrAdmin } from "@/lib/rbac";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { RepDashboardView } from "@/components/dashboard/RepDashboardView";
import { ManagerDashboardView } from "@/components/dashboard/ManagerDashboardView";
import { AdminDashboardView } from "@/components/dashboard/AdminDashboardView";

export default function DashboardPage() {
  const { role, userName } = useSession();
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-stats", period, selectedUserId],
    queryFn: async () => {
      const url = new URL("/api/dashboard/stats", window.location.origin);
      url.searchParams.set("period", period);
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
    staleTime: 30 * 1000, // 30 seconds
  });

  const handlePeriodChange = (newPeriod: "today" | "week" | "month") => {
    setPeriod(newPeriod);
  };

  const handleUserChange = (userId: string | null) => {
    setSelectedUserId(userId);
  };

  const handleSelectRep = (repId: string) => {
    setSelectedUserId(repId);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Role-Adaptive Dashboard Header & Filters */}
      <DashboardHeader
        userName={userName || "Team Member"}
        userRole={role}
        period={period}
        onPeriodChange={handlePeriodChange}
        selectedUserId={selectedUserId}
        onUserChange={handleUserChange}
        teamMembers={data?.teamMembers || []}
        canFilterUser={isManagerOrAdmin(role)}
        onRefresh={() => refetch()}
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
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition shadow-xs"
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
              onSelectRep={handleSelectRep}
              selectedRepId={selectedUserId}
            />
          )}

          {/* Level 2: Sales Manager / Team Lead Operations Hub */}
          {isSalesManager(role) && (
            <ManagerDashboardView
              metrics={data.metrics}
              period={period}
              onSelectRep={handleSelectRep}
              selectedRepId={selectedUserId}
            />
          )}

          {/* Level 1: Sales Representative Personal Cockpit */}
          {isSalesRep(role) && (
            <RepDashboardView
              metrics={data.metrics}
              period={period}
            />
          )}

          {/* Accounts & Operations / Other Fallback */}
          {!isAdmin(role) && !isSalesManager(role) && !isSalesRep(role) && (
            <ManagerDashboardView
              metrics={data.metrics}
              period={period}
              onSelectRep={handleSelectRep}
              selectedRepId={selectedUserId}
            />
          )}
        </>
      )}
    </div>
  );
}
