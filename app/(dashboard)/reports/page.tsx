"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, RefreshCw, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

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
  reps: RepMetrics[];
  totals: Omit<RepMetrics, "repId" | "repName">;
}

async function fetchEOD(date: string): Promise<EODData> {
  const res = await fetch(`/api/reports/eod?date=${date}`);
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
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["eod", date],
    queryFn: () => fetchEOD(date),
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 min
  });

  async function handleExport() {
    const res = await fetch(`/api/reports/eod?date=${date}`);
    const data = await res.json();

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
    const rows = data.reps.map((r: RepMetrics) => [
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
    a.download = `textora-eod-${date}.csv`;
    a.click();
  }

  const totals = data?.totals;
  const reps = data?.reps || [];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            EOD Sales Report
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Real-time team performance dashboard
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={today}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            <RefreshCw className="w-4 h-4" />
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
                  Team Totals — {date}
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
