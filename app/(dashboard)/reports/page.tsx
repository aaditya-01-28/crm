"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, Download, RefreshCw, TrendingUp, Calendar } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type ReportPeriod = "today" | "yesterday" | "week" | "month" | "custom";

const formatLocalDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getPresetDates = (preset: ReportPeriod): { from: string; to: string } => {
  const now = new Date();
  const todayStr = formatLocalDate(now);
  if (preset === "yesterday") {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yStr = formatLocalDate(y);
    return { from: yStr, to: yStr };
  }
  if (preset === "week") {
    const p7 = new Date();
    p7.setDate(p7.getDate() - 6);
    return { from: formatLocalDate(p7), to: todayStr };
  }
  if (preset === "month") {
    const p30 = new Date();
    p30.setDate(p30.getDate() - 29);
    return { from: formatLocalDate(p30), to: todayStr };
  }
  return { from: todayStr, to: todayStr };
};

interface RepMetrics {
  repId: string;
  repName: string;
  totalCalls: number;
  uniqueDialed: number;
  connectedCalls: number;
  talkTimeMins: number;
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
  { key: "talkTimeMins", label: "Talk Time (min)", icon: "⏱️", color: "text-teal-700 bg-teal-50" },
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

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["eod", period, customDateFrom, customDateTo],
    queryFn: () => fetchEOD(customDateFrom, customDateTo),
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 min
  });

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
      "Talk Time (min)",
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
      r.talkTimeMins,
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {METRICS_CONFIG.map((m) => (
                  <MetricCard
                    key={m.key}
                    icon={m.icon}
                    label={m.label}
                    value={totals[m.key as keyof typeof totals]}
                    isCurrency={m.isCurrency}
                    color={m.color}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Rep Leaderboard */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Rep Performance</h2>
            </div>
            {reps.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                No activity recorded for this date
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Rep</th>
                      <th className="px-3 py-3 text-center font-semibold">Calls</th>
                      <th className="px-3 py-3 text-center font-semibold">Unique</th>
                      <th className="px-3 py-3 text-center font-semibold">Connected</th>
                      <th className="px-3 py-3 text-center font-semibold">Talk (min)</th>
                      <th className="px-3 py-3 text-center font-semibold">Demos 📅</th>
                      <th className="px-3 py-3 text-center font-semibold">Done ✅</th>
                      <th className="px-3 py-3 text-center font-semibold">Quotes</th>
                      <th className="px-3 py-3 text-right font-semibold">Quoted ₹</th>
                      <th className="px-3 py-3 text-right font-semibold">Revenue ₹</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reps
                      .sort((a, b) => b.revenueCollected - a.revenueCollected)
                      .map((rep, i) => (
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
                          <td className="px-3 py-3 text-center text-gray-600">{rep.totalCalls}</td>
                          <td className="px-3 py-3 text-center text-gray-600">{rep.uniqueDialed}</td>
                          <td className="px-3 py-3 text-center">
                            <span className="font-medium text-green-700">{rep.connectedCalls}</span>
                          </td>
                          <td className="px-3 py-3 text-center text-gray-600">{rep.talkTimeMins}</td>
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
  isCurrency,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  isCurrency?: boolean;
  color: string;
}) {
  const [bg, text] = color.split(" ");
  return (
    <div className={`rounded-xl border border-gray-200 p-4 bg-white`}>
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${bg} mb-2`}>
        <span className="text-base">{icon}</span>
      </div>
      <p className={`text-xl font-bold ${text}`}>
        {isCurrency ? formatCurrency(value) : value.toLocaleString("en-IN")}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
