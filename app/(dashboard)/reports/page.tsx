"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, Download, RefreshCw, TrendingUp, Calendar, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { formatCurrency, formatDuration, getISTDateRange, getISTDateString } from "@/lib/utils";

type ReportPeriod = "today" | "yesterday" | "week" | "month" | "custom";

type SortField =
  | "repName"
  | "totalCalls"
  | "uniqueDialed"
  | "connectedCalls"
  | "interestedCalls"
  | "talkTime"
  | "demosBooked"
  | "demosCompleted"
  | "quotesSent"
  | "totalQuotedValue"
  | "revenueCollected";

type SortDirection = "asc" | "desc";

const getPresetDates = (preset: ReportPeriod): { from: string; to: string } => {
  const { startOfPeriod, endOfPeriod } = getISTDateRange(preset);
  const from = getISTDateString(startOfPeriod);
  const to = getISTDateString(endOfPeriod);
  return { from, to };
};

interface RepMetrics {
  repId: string;
  repName: string;
  totalCalls: number;
  uniqueDialed: number;
  connectedCalls: number;
  interestedCalls: number;
  interestedRate?: number;
  talkTimeMins: number;
  talkTimeSecs?: number;
  talkTimeFormatted?: string;
  demosBooked: number;
  demosCompleted: number;
  quotesSent: number;
  totalQuotedValue: number;
  paymentsCollected: number;
  revenueCollected: number;
}

interface EODData {
  date: string;
  dateFrom?: string;
  dateTo?: string;
  reps: RepMetrics[];
  totals: Omit<RepMetrics, "repId" | "repName">;
}

async function fetchEOD(dateFrom: string, dateTo: string): Promise<EODData> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const res = await fetch(`/api/reports/eod?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch EOD report");
  return res.json();
}

const METRICS_CONFIG: {
  key: keyof Omit<RepMetrics, "repId" | "repName">;
  label: string;
  icon: string;
  isCurrency?: boolean;
  color: string;
}[] = [
  { key: "totalCalls", label: "Total Calls", icon: "📞", color: "text-blue-700 bg-blue-50" },
  { key: "uniqueDialed", label: "Unique Dialed", icon: "📱", color: "text-indigo-700 bg-indigo-50" },
  { key: "connectedCalls", label: "Connected", icon: "🤝", color: "text-green-700 bg-green-50" },
  { key: "interestedCalls", label: "Interested Leads", icon: "🔥", color: "text-amber-700 bg-amber-50" },
  { key: "talkTimeFormatted" as any, label: "Talk Time", icon: "⏱️", color: "text-teal-700 bg-teal-50" },
  { key: "demosBooked", label: "Demos Booked", icon: "📅", color: "text-purple-700 bg-purple-50" },
  { key: "demosCompleted", label: "Demos Done", icon: "✅", color: "text-violet-700 bg-violet-50" },
  { key: "quotesSent", label: "Quotes Sent", icon: "📄", color: "text-yellow-700 bg-yellow-50" },
  { key: "totalQuotedValue", label: "Quoted Value", icon: "💰", isCurrency: true, color: "text-amber-700 bg-amber-50" },
  { key: "paymentsCollected", label: "Payments", icon: "💳", color: "text-orange-700 bg-orange-50" },
  { key: "revenueCollected", label: "Revenue", icon: "🏦", isCurrency: true, color: "text-red-700 bg-red-50" },
];

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [customDateFrom, setCustomDateFrom] = useState(() => getPresetDates("today").from);
  const [customDateTo, setCustomDateTo] = useState(() => getPresetDates("today").to);
  const [sortField, setSortField] = useState<SortField>("totalCalls");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["eod", period, customDateFrom, customDateTo],
    queryFn: () => fetchEOD(customDateFrom, customDateTo),
    refetchInterval: 15_000, // Real-time 15s auto-refresh
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDirection(field === "repName" ? "asc" : "desc");
    }
  };

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success("EOD report updated");
    } catch {
      toast.error("Failed to refresh EOD report");
    }
  };

  async function handleExport() {
    const params = new URLSearchParams();
    if (customDateFrom) params.set("dateFrom", customDateFrom);
    if (customDateTo) params.set("dateTo", customDateTo);
    const res = await fetch(`/api/reports/eod?${params.toString()}`);
    const exportData = await res.json();

    // Build CSV
    const headers = [
      "Rep",
      "Total Calls",
      "Unique Dialed",
      "Connected",
      "Interested Leads",
      "Talk Time (min & sec)",
      "Demos Booked",
      "Demos Done",
      "Quotes Sent",
      "Quoted Value (₹)",
      "Payments",
      "Revenue (₹)",
    ];
    const rows = (exportData.reps || []).map((r: RepMetrics) => [
      r.repName,
      r.totalCalls,
      r.uniqueDialed,
      r.connectedCalls,
      r.interestedCalls ?? 0,
      r.talkTimeFormatted || formatDuration((r.talkTimeMins || 0) * 60),
      r.demosBooked,
      r.demosCompleted,
      r.quotesSent,
      r.totalQuotedValue,
      r.paymentsCollected,
      r.revenueCollected,
    ]);

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `textora-eod-${customDateFrom}-to-${customDateTo}.csv`;
    a.click();
  }

  const totals = data?.totals;
  const reps = data?.reps || [];

  const sortedReps = [...reps].sort((a, b) => {
    let valA: any;
    let valB: any;
    if (sortField === "talkTime") {
      valA = a.talkTimeSecs ?? (a.talkTimeMins || 0) * 60;
      valB = b.talkTimeSecs ?? (b.talkTimeMins || 0) * 60;
    } else {
      valA = a[sortField];
      valB = b[sortField];
    }

    if (typeof valA === "string") {
      const cmp = valA.localeCompare(valB || "");
      return sortDirection === "asc" ? cmp : -cmp;
    }
    const numA = Number(valA || 0);
    const numB = Number(valB || 0);
    return sortDirection === "asc" ? numA - numB : numB - numA;
  });

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            EOD Sales Report
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Real-time team performance dashboard
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Time Period Dropdown Filter (Matching Image 4) */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <select
              value={period}
              onChange={(e) => {
                const newPeriod = e.target.value as ReportPeriod;
                setPeriod(newPeriod);
                if (newPeriod !== "custom") {
                  const dates = getPresetDates(newPeriod);
                  setCustomDateFrom(dates.from);
                  setCustomDateTo(dates.to);
                }
              }}
              className="bg-transparent font-semibold text-gray-800 outline-none cursor-pointer py-1 text-xs"
              title="Filter report by period"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">This Week (Last 7 Days)</option>
              <option value="month">This Month (Last 30 Days)</option>
              {period === "custom" && (
                <option value="custom">Custom Date Range</option>
              )}
            </select>
          </div>

          {/* Date Range Picker (From and To) */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-gray-500">From:</span>
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => {
                  setCustomDateFrom(e.target.value);
                  setPeriod("custom");
                }}
                className="bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-emerald-500 font-medium cursor-pointer"
                title="Start Date"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-gray-500">To:</span>
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => {
                  setCustomDateTo(e.target.value);
                  setPeriod("custom");
                }}
                className="bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-emerald-500 font-medium cursor-pointer"
                title="End Date"
              />
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition cursor-pointer disabled:opacity-60"
            title="Refresh Report Metrics"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin text-emerald-600" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition font-medium shadow-xs"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Team Totals Summary */}
          {totals && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Team Totals — {data?.date || (customDateFrom === customDateTo ? customDateFrom : `${customDateFrom} to ${customDateTo}`)}
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {METRICS_CONFIG.map((m) => (
                  <MetricCard
                    key={m.key}
                    icon={m.icon}
                    label={m.label}
                    value={totals[m.key as keyof typeof totals]}
                    subLabel={
                      m.key === "interestedCalls" && (totals as any)?.connectedCalls > 0
                        ? `${(totals as any)?.interestedRate || 0}% conv.`
                        : undefined
                    }
                    isCurrency={m.isCurrency}
                    color={m.color}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Rep Leaderboard */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-gray-800 text-base">Rep Performance Leaderboard</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Sorted by <strong className="text-emerald-700 font-semibold">{
                    sortField === "totalCalls" ? "Calls" :
                    sortField === "uniqueDialed" ? "Unique Dialed" :
                    sortField === "connectedCalls" ? "Connected Calls" :
                    sortField === "talkTime" ? "Talk Time" :
                    sortField === "demosBooked" ? "Demos Booked" :
                    sortField === "demosCompleted" ? "Demos Done" :
                    sortField === "quotesSent" ? "Quotes" :
                    sortField === "totalQuotedValue" ? "Quoted Value" :
                    sortField === "revenueCollected" ? "Revenue" : "Rep Name"
                  }</strong> ({sortDirection === "desc" ? "highest first ↓" : "lowest first ↑"}) • Click any column title to sort
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync (15s)
                </span>
              </div>
            </div>
            {reps.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                No activity recorded for this date
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-200">
                    <tr>
                      <th
                        onClick={() => handleSort("repName")}
                        className="px-4 py-3 text-left font-semibold cursor-pointer select-none group hover:bg-gray-100 transition"
                        title="Sort by Rep Name"
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <span className={sortField === "repName" ? "text-emerald-700 font-bold" : ""}>Rep</span>
                          {sortField === "repName" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 group-hover:opacity-100 transition" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort("totalCalls")}
                        className="px-3 py-3 text-center font-semibold cursor-pointer select-none group hover:bg-gray-100 transition"
                        title="Sort by Total Calls"
                      >
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <span className={sortField === "totalCalls" ? "text-emerald-700 font-bold" : ""}>Calls</span>
                          {sortField === "totalCalls" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 group-hover:opacity-100 transition" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort("uniqueDialed")}
                        className="px-3 py-3 text-center font-semibold cursor-pointer select-none group hover:bg-gray-100 transition"
                        title="Sort by Unique Leads Dialed"
                      >
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <span className={sortField === "uniqueDialed" ? "text-emerald-700 font-bold" : ""}>Unique</span>
                          {sortField === "uniqueDialed" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 group-hover:opacity-100 transition" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort("connectedCalls")}
                        className="px-3 py-3 text-center font-semibold cursor-pointer select-none group hover:bg-gray-100 transition"
                        title="Sort by Connected Calls"
                      >
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <span className={sortField === "connectedCalls" ? "text-emerald-700 font-bold" : ""}>Connected</span>
                          {sortField === "connectedCalls" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 group-hover:opacity-100 transition" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort("interestedCalls")}
                        className="px-3 py-3 text-center font-semibold cursor-pointer select-none group hover:bg-gray-100 transition"
                        title="Sort by Interested Leads (Callbacks, Demos, Quotes)"
                      >
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <span className={sortField === "interestedCalls" ? "text-amber-700 font-bold" : ""}>Interested 🔥</span>
                          {sortField === "interestedCalls" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-amber-600" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 group-hover:opacity-100 transition" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort("talkTime")}
                        className="px-3 py-3 text-center font-semibold cursor-pointer select-none group hover:bg-gray-100 transition"
                        title="Sort by Talk Time"
                      >
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <span className={sortField === "talkTime" ? "text-emerald-700 font-bold" : ""}>Talk Time</span>
                          {sortField === "talkTime" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 group-hover:opacity-100 transition" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort("demosBooked")}
                        className="px-3 py-3 text-center font-semibold cursor-pointer select-none group hover:bg-gray-100 transition"
                        title="Sort by Demos Booked"
                      >
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <span className={sortField === "demosBooked" ? "text-emerald-700 font-bold" : ""}>Demos 📅</span>
                          {sortField === "demosBooked" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 group-hover:opacity-100 transition" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort("demosCompleted")}
                        className="px-3 py-3 text-center font-semibold cursor-pointer select-none group hover:bg-gray-100 transition"
                        title="Sort by Demos Done"
                      >
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <span className={sortField === "demosCompleted" ? "text-emerald-700 font-bold" : ""}>Done ✅</span>
                          {sortField === "demosCompleted" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 group-hover:opacity-100 transition" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort("quotesSent")}
                        className="px-3 py-3 text-center font-semibold cursor-pointer select-none group hover:bg-gray-100 transition"
                        title="Sort by Quotes Sent"
                      >
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <span className={sortField === "quotesSent" ? "text-emerald-700 font-bold" : ""}>Quotes</span>
                          {sortField === "quotesSent" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 group-hover:opacity-100 transition" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort("totalQuotedValue")}
                        className="px-3 py-3 text-right font-semibold cursor-pointer select-none group hover:bg-gray-100 transition"
                        title="Sort by Total Quoted Value"
                      >
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <span className={sortField === "totalQuotedValue" ? "text-emerald-700 font-bold" : ""}>Quoted ₹</span>
                          {sortField === "totalQuotedValue" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 group-hover:opacity-100 transition" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort("revenueCollected")}
                        className="px-3 py-3 text-right font-semibold cursor-pointer select-none group hover:bg-gray-100 transition"
                        title="Sort by Revenue Collected"
                      >
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <span className={sortField === "revenueCollected" ? "text-emerald-700 font-bold" : ""}>Revenue ₹</span>
                          {sortField === "revenueCollected" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 group-hover:opacity-100 transition" />
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedReps.map((rep, i) => (
                      <tr
                        key={rep.repId}
                        className="hover:bg-gray-50 transition"
                      >
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {i === 0 && "🥇 "}
                          {i === 1 && "🥈 "}
                          {i === 2 && "🥉 "}
                          {rep.repName}
                        </td>
                        <td className="px-3 py-3 text-center text-gray-700 font-semibold">{rep.totalCalls}</td>
                        <td className="px-3 py-3 text-center text-gray-600">{rep.uniqueDialed}</td>
                        <td className="px-3 py-3 text-center">
                          <span className="font-medium text-green-700">{rep.connectedCalls}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="font-bold text-amber-700">{rep.interestedCalls ?? 0}</span>
                          {rep.connectedCalls > 0 && (
                            <span className="text-[10px] text-gray-400 block font-medium">
                              {rep.interestedRate ?? Math.round(((rep.interestedCalls || 0) / rep.connectedCalls) * 100)}%
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center text-gray-600 font-medium">
                          {rep.talkTimeFormatted || formatDuration((rep.talkTimeMins || 0) * 60)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="font-medium text-purple-700">{rep.demosBooked}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="font-medium text-violet-700">{rep.demosCompleted}</span>
                        </td>
                        <td className="px-3 py-3 text-center text-gray-600">{rep.quotesSent}</td>
                        <td className="px-3 py-3 text-right text-gray-700 font-medium">
                          {formatCurrency(rep.totalQuotedValue)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="font-bold text-green-700">
                            {formatCurrency(rep.revenueCollected)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  subLabel,
  isCurrency,
  color,
}: {
  icon: string;
  label: string;
  value: number | string | undefined;
  subLabel?: string;
  isCurrency?: boolean;
  color: string;
}) {
  const [bg, text] = color.split(" ");
  return (
    <div className={`rounded-xl border border-gray-200 p-4 bg-white relative overflow-hidden`}>
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${bg} mb-2`}>
        <span className="text-base">{icon}</span>
      </div>
      <p className={`text-xl font-bold ${text}`}>
        {isCurrency && typeof value === "number"
          ? formatCurrency(value)
          : typeof value === "number"
          ? value.toLocaleString("en-IN")
          : value ?? 0}
      </p>
      <div className="flex items-center justify-between gap-1 mt-0.5">
        <p className="text-xs text-gray-500">{label}</p>
        {subLabel && (
          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 shrink-0">
            {subLabel}
          </span>
        )}
      </div>
    </div>
  );
}
