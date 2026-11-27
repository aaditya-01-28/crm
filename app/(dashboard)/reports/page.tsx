"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, Download, RefreshCw, TrendingUp, Calendar, ArrowUp, ArrowDown, ArrowUpDown, Camera, Check } from "lucide-react";
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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function renderEodSnapshotCanvas(params: {
  data: EODData;
  sortedReps: RepMetrics[];
  dateFrom: string;
  dateTo: string;
  sortField: string;
  sortDirection: "asc" | "desc";
}): HTMLCanvasElement {
  const { data, sortedReps, dateFrom, dateTo, sortField, sortDirection } = params;
  const totals = data.totals;
  const scale = 2;
  const width = 1280;
  const pad = 28;
  const contentW = width - pad * 2;

  const headerH = 92;
  const sectionLabelH = 30;
  const kpiCols = 6;
  const kpiGap = 14;
  const kpiCardW = (contentW - kpiGap * (kpiCols - 1)) / kpiCols;
  const kpiCardH = 96;
  const kpiRows = 2;
  const kpiGridH = kpiRows * kpiCardH + (kpiRows - 1) * kpiGap;

  const tableTopGap = 24;
  const tableHeaderBarH = 62;
  const colHeaderH = 40;
  const rowH = 50;
  const rowsCount = Math.max(sortedReps.length, 1);
  const footerRowH = 48;
  const tableCardH = tableHeaderBarH + colHeaderH + rowsCount * rowH + footerRowH + 10;
  const bottomFooterH = 34;

  const height =
    pad +
    headerH +
    20 +
    sectionLabelH +
    kpiGridH +
    tableTopGap +
    tableCardH +
    14 +
    bottomFooterH +
    pad;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to initialize canvas 2D context");

  ctx.scale(scale, scale);
  const fontSans = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

  // Background
  ctx.fillStyle = "#F8FAFC";
  ctx.fillRect(0, 0, width, height);

  // Dark Header Banner
  const headerY = pad;
  drawRoundedRect(ctx, pad, headerY, contentW, headerH, 14);
  ctx.fillStyle = "#0F172A";
  ctx.fill();

  // Brand badge
  drawRoundedRect(ctx, pad + 24, headerY + 18, 162, 22, 6);
  ctx.fillStyle = "rgba(16, 185, 129, 0.16)";
  ctx.fill();
  ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#34D399";
  ctx.font = `700 10.5px ${fontSans}`;
  ctx.textBaseline = "middle";
  ctx.fillText("TEXTORA ENGAGE PRO", pad + 34, headerY + 29);

  // Title & subtitle
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 22px ${fontSans}`;
  ctx.fillText("EOD Sales Report", pad + 24, headerY + 58);

  ctx.fillStyle = "#94A3B8";
  ctx.font = `500 12px ${fontSans}`;
  ctx.fillText("Complete Team Totals & Full Rep Performance Leaderboard", pad + 224, headerY + 59);

  // Date & capture metadata on header right
  const dateLabel = dateFrom === dateTo ? dateFrom : `${dateFrom} to ${dateTo}`;
  const capturedAt = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  ctx.textAlign = "right";
  ctx.fillStyle = "#E2E8F0";
  ctx.font = `700 14px ${fontSans}`;
  ctx.fillText(`Period: ${dateLabel}`, width - pad - 24, headerY + 35);
  ctx.fillStyle = "#94A3B8";
  ctx.font = `500 11.5px ${fontSans}`;
  ctx.fillText(`Snapshot: ${capturedAt} IST`, width - pad - 24, headerY + 60);
  ctx.textAlign = "left";

  // Section label
  const secLabelY = headerY + headerH + 20;
  ctx.fillStyle = "#059669";
  ctx.font = `700 12px ${fontSans}`;
  ctx.fillText(`TEAM TOTALS — ${dateLabel}`, pad + 2, secLabelY + 12);

  // KPI Cards
  const kpiStartY = secLabelY + sectionLabelH;
  const tintMap: Record<string, { bg: string; value: string; dot: string }> = {
    totalCalls: { bg: "#EFF6FF", value: "#1D4ED8", dot: "#3B82F6" },
    uniqueDialed: { bg: "#EEF2FF", value: "#4338CA", dot: "#6366F1" },
    connectedCalls: { bg: "#ECFDF5", value: "#047857", dot: "#10B981" },
    interestedCalls: { bg: "#FFFBEB", value: "#B45309", dot: "#F59E0B" },
    talkTimeFormatted: { bg: "#F0FDFA", value: "#0F766E", dot: "#14B8A6" },
    demosBooked: { bg: "#FAF5FF", value: "#7E22CE", dot: "#A855F7" },
    demosCompleted: { bg: "#F5F3FF", value: "#6D28D9", dot: "#8B5CF6" },
    quotesSent: { bg: "#FEFCE8", value: "#A16207", dot: "#EAB308" },
    totalQuotedValue: { bg: "#FFFBEB", value: "#B45309", dot: "#F59E0B" },
    paymentsCollected: { bg: "#FFF7ED", value: "#C2410C", dot: "#F97316" },
    revenueCollected: { bg: "#FEF2F2", value: "#B91C1C", dot: "#EF4444" },
  };

  const convPct =
    totals.connectedCalls > 0
      ? Math.round((totals.interestedCalls / totals.connectedCalls) * 100)
      : 0;

  METRICS_CONFIG.forEach((metric, idx) => {
    const row = Math.floor(idx / kpiCols);
    const col = idx % kpiCols;
    const x = pad + col * (kpiCardW + kpiGap);
    const y = kpiStartY + row * (kpiCardH + kpiGap);
    const style = tintMap[String(metric.key)] || { bg: "#F8FAFC", value: "#0F172A", dot: "#64748B" };

    drawRoundedRect(ctx, x, y, kpiCardW, kpiCardH, 12);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Top dot / accent bar
    drawRoundedRect(ctx, x + 14, y + 14, 24, 24, 7);
    ctx.fillStyle = style.bg;
    ctx.fill();
    ctx.fillStyle = style.dot;
    ctx.beginPath();
    ctx.arc(x + 26, y + 26, 4.5, 0, Math.PI * 2);
    ctx.fill();

    const rawVal = (totals as Record<string, unknown>)[metric.key as string];
    let displayVal = String(rawVal ?? 0);
    if (metric.key === ("talkTimeFormatted" as unknown)) {
      displayVal =
        totals.talkTimeFormatted ||
        formatDuration(totals.talkTimeSecs ?? (totals.talkTimeMins || 0) * 60);
    } else if (metric.isCurrency) {
      displayVal = formatCurrency(Number(rawVal || 0));
    }

    // Highlight strip behind metric value
    drawRoundedRect(ctx, x + 12, y + 44, kpiCardW - 24, 26, 6);
    ctx.fillStyle = style.bg;
    ctx.fill();

    ctx.fillStyle = "#0F172A";
    ctx.font = `700 16px ${fontSans}`;
    ctx.fillText(displayVal, x + 18, y + 57);

    ctx.fillStyle = "#64748B";
    ctx.font = `500 11px ${fontSans}`;
    ctx.fillText(metric.label, x + 14, y + 81);

    if (metric.key === "interestedCalls") {
      const badgeW = 54;
      drawRoundedRect(ctx, x + kpiCardW - badgeW - 12, y + 72, badgeW, 17, 4);
      ctx.fillStyle = "#FEF3C7";
      ctx.fill();
      ctx.fillStyle = "#92400E";
      ctx.font = `700 9.5px ${fontSans}`;
      ctx.textAlign = "center";
      ctx.fillText(`${convPct}% conv.`, x + kpiCardW - badgeW / 2 - 12, y + 80.5);
      ctx.textAlign = "left";
    }
  });

  // Leaderboard Card
  const tableY = kpiStartY + kpiGridH + tableTopGap;
  drawRoundedRect(ctx, pad, tableY, contentW, tableCardH, 14);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Table card title bar
  ctx.fillStyle = "#0F172A";
  ctx.font = `700 16px ${fontSans}`;
  ctx.fillText("Rep Performance Leaderboard", pad + 20, tableY + 25);

  ctx.fillStyle = "#64748B";
  ctx.font = `500 11.5px ${fontSans}`;
  const sortPretty = sortField.replace(/([A-Z])/g, " $1").trim();
  ctx.fillText(
    `Sorted by ${sortPretty} (${sortDirection === "desc" ? "highest first" : "lowest first"}) • ${sortedReps.length} active rep(s)`,
    pad + 20,
    tableY + 45
  );

  // Live pill badge
  drawRoundedRect(ctx, width - pad - 150, tableY + 18, 130, 26, 13);
  ctx.fillStyle = "#ECFDF5";
  ctx.fill();
  ctx.strokeStyle = "#A7F3D0";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#047857";
  ctx.font = `600 11px ${fontSans}`;
  ctx.textAlign = "center";
  ctx.fillText("Full Team Snapshot", width - pad - 85, tableY + 31);
  ctx.textAlign = "left";

  // Table Columns
  const colHdrY = tableY + tableHeaderBarH;
  ctx.fillStyle = "#F8FAFC";
  ctx.fillRect(pad + 1, colHdrY, contentW - 2, colHeaderH);
  ctx.strokeStyle = "#E2E8F0";
  ctx.beginPath();
  ctx.moveTo(pad, colHdrY);
  ctx.lineTo(width - pad, colHdrY);
  ctx.moveTo(pad, colHdrY + colHeaderH);
  ctx.lineTo(width - pad, colHdrY + colHeaderH);
  ctx.stroke();

  const columns = [
    { label: "Rep", x: pad + 20, align: "left" as const },
    { label: "Calls", x: pad + 285, align: "right" as const },
    { label: "Unique", x: pad + 375, align: "right" as const },
    { label: "Connected", x: pad + 475, align: "right" as const },
    { label: "Interested", x: pad + 585, align: "right" as const },
    { label: "Talk Time", x: pad + 705, align: "right" as const },
    { label: "Demos", x: pad + 795, align: "right" as const },
    { label: "Done", x: pad + 875, align: "right" as const },
    { label: "Quotes", x: pad + 955, align: "right" as const },
    { label: "Quoted ₹", x: pad + 1080, align: "right" as const },
    { label: "Revenue ₹", x: width - pad - 20, align: "right" as const },
  ];

  ctx.fillStyle = "#475569";
  ctx.font = `600 11.5px ${fontSans}`;
  for (const col of columns) {
    ctx.textAlign = col.align;
    ctx.fillText(col.label, col.x, colHdrY + colHeaderH / 2);
  }
  ctx.textAlign = "left";

  // Table Rows
  const rowsStartY = colHdrY + colHeaderH;
  if (sortedReps.length === 0) {
    ctx.fillStyle = "#94A3B8";
    ctx.font = `500 13px ${fontSans}`;
    ctx.textAlign = "center";
    ctx.fillText("No rep performance data available for the selected range.", width / 2, rowsStartY + rowH / 2);
    ctx.textAlign = "left";
  } else {
    sortedReps.forEach((rep, idx) => {
      const y = rowsStartY + idx * rowH;
      if (idx % 2 === 1) {
        ctx.fillStyle = "#FAFBFD";
        ctx.fillRect(pad + 1, y, contentW - 2, rowH);
      }
      ctx.strokeStyle = "#F1F5F9";
      ctx.beginPath();
      ctx.moveTo(pad + 1, y + rowH);
      ctx.lineTo(width - pad - 1, y + rowH);
      ctx.stroke();

      const rankBadge = idx === 0 ? "🥇 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : `${idx + 1}. `;
      const repName = rep.repName || "Unknown";
      const truncatedName = repName.length > 24 ? `${repName.slice(0, 22)}…` : repName;

      ctx.textAlign = "left";
      ctx.fillStyle = "#0F172A";
      ctx.font = `600 13px ${fontSans}`;
      ctx.fillText(`${rankBadge}${truncatedName}`, columns[0].x, y + rowH / 2);

      const drawCell = (text: string, colIdx: number, color = "#334155", bold = false, yOffset = 0) => {
        ctx.textAlign = columns[colIdx].align;
        ctx.fillStyle = color;
        ctx.font = `${bold ? "700" : "600"} 13px ${fontSans}`;
        ctx.fillText(text, columns[colIdx].x, y + rowH / 2 + yOffset);
      };

      drawCell(String(rep.totalCalls), 1, "#0F172A", true);
      drawCell(String(rep.uniqueDialed), 2, "#475569");
      drawCell(String(rep.connectedCalls), 3, "#059669", true);

      const repConv =
        rep.interestedRate ??
        (rep.connectedCalls > 0 ? Math.round((rep.interestedCalls / rep.connectedCalls) * 100) : 0);
      drawCell(String(rep.interestedCalls), 4, "#B45309", true, -7);
      ctx.textAlign = columns[4].align;
      ctx.fillStyle = "#94A3B8";
      ctx.font = `500 10px ${fontSans}`;
      ctx.fillText(`${repConv}%`, columns[4].x, y + rowH / 2 + 10);

      const repTalk =
        rep.talkTimeFormatted ||
        formatDuration(rep.talkTimeSecs ?? (rep.talkTimeMins || 0) * 60);
      drawCell(repTalk, 5, "#334155");
      drawCell(String(rep.demosBooked), 6, "#7E22CE", true);
      drawCell(String(rep.demosCompleted), 7, "#6D28D9", true);
      drawCell(String(rep.quotesSent), 8, "#475569");
      drawCell(formatCurrency(rep.totalQuotedValue || 0), 9, "#334155");
      drawCell(formatCurrency(rep.revenueCollected || 0), 10, "#059669", true);
      ctx.textAlign = "left";
    });
  }

  // Team Totals Summary Row at bottom of table
  const summaryY = rowsStartY + rowsCount * rowH;
  ctx.fillStyle = "#ECFDF5";
  ctx.fillRect(pad + 1, summaryY, contentW - 2, footerRowH);
  ctx.strokeStyle = "#A7F3D0";
  ctx.beginPath();
  ctx.moveTo(pad + 1, summaryY);
  ctx.lineTo(width - pad - 1, summaryY);
  ctx.stroke();

  const totalTalk =
    totals.talkTimeFormatted ||
    formatDuration(totals.talkTimeSecs ?? (totals.talkTimeMins || 0) * 60);

  ctx.textAlign = "left";
  ctx.fillStyle = "#065F46";
  ctx.font = `700 13px ${fontSans}`;
  ctx.fillText("TEAM TOTAL", columns[0].x, summaryY + footerRowH / 2);

  const summaryValues: [number, string][] = [
    [1, String(totals.totalCalls)],
    [2, String(totals.uniqueDialed)],
    [3, String(totals.connectedCalls)],
    [4, `${totals.interestedCalls} (${convPct}%)`],
    [5, totalTalk],
    [6, String(totals.demosBooked)],
    [7, String(totals.demosCompleted)],
    [8, String(totals.quotesSent)],
    [9, formatCurrency(totals.totalQuotedValue || 0)],
    [10, formatCurrency(totals.revenueCollected || 0)],
  ];
  for (const [colIdx, val] of summaryValues) {
    ctx.textAlign = columns[colIdx].align;
    ctx.fillStyle = "#065F46";
    ctx.font = `700 13px ${fontSans}`;
    ctx.fillText(val, columns[colIdx].x, summaryY + footerRowH / 2);
  }
  ctx.textAlign = "left";

  // Bottom Watermark
  const bottomY = tableY + tableCardH + 22;
  ctx.fillStyle = "#94A3B8";
  ctx.font = `500 11px ${fontSans}`;
  ctx.fillText("Textora Engage CRM • crm.textorasms.com", pad + 4, bottomY);
  ctx.textAlign = "right";
  ctx.fillText("All metrics computed in IST (Asia/Kolkata)", width - pad - 4, bottomY);
  ctx.textAlign = "left";

  return canvas;
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [customDateFrom, setCustomDateFrom] = useState(() => getPresetDates("today").from);
  const [customDateTo, setCustomDateTo] = useState(() => getPresetDates("today").to);
  const [sortField, setSortField] = useState<SortField>("totalCalls");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isCopyingSnapshot, setIsCopyingSnapshot] = useState(false);
  const [snapshotCopied, setSnapshotCopied] = useState(false);

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

  const handleCopySnapshot = async () => {
    if (!data || !totals) {
      toast.error("Report data is still loading");
      return;
    }

    setIsCopyingSnapshot(true);
    try {
      const canvas = renderEodSnapshotCanvas({
        data,
        sortedReps,
        dateFrom: data.dateFrom || customDateFrom,
        dateTo: data.dateTo || customDateTo,
        sortField,
        sortDirection,
      });

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((result) => resolve(result), "image/png")
      );
      if (!blob) {
        throw new Error("Failed to generate snapshot image");
      }

      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof ClipboardItem !== "undefined"
      ) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setSnapshotCopied(true);
          toast.success("Full EOD Report snapshot copied to clipboard!");
          setTimeout(() => setSnapshotCopied(false), 2500);
          return;
        } catch {
          // Fall through to PNG download fallback when clipboard write is restricted
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `textora-eod-snapshot-${data.dateFrom || customDateFrom}-to-${data.dateTo || customDateTo}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.info("Clipboard blocked by browser — downloaded EOD snapshot PNG instead");
    } catch (error) {
      console.error("EOD snapshot failed:", error);
      toast.error("Could not generate EOD snapshot");
    } finally {
      setIsCopyingSnapshot(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 mb-6 shadow-2xs flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 whitespace-nowrap">
            <BarChart3 className="w-6 h-6 text-emerald-600 shrink-0" />
            <span>EOD Sales Report</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:whitespace-nowrap">
            Real-time team performance dashboard
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          {/* Date Controls Group */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Time Period Dropdown Filter */}
            <div className="h-9 flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 text-xs">
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
                className="bg-transparent font-semibold text-gray-800 outline-none cursor-pointer text-xs pr-1"
                title="Filter report by period"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="week">This Week (7D)</option>
                <option value="month">This Month (30D)</option>
                {period === "custom" && (
                  <option value="custom">Custom Range</option>
                )}
              </select>
            </div>

            {/* Date Range Picker (From and To) */}
            <div className="h-9 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-2.5 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-gray-500">From:</span>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => {
                    setCustomDateFrom(e.target.value);
                    setPeriod("custom");
                  }}
                  className="bg-white border border-gray-200 rounded-md px-2 py-0.5 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-emerald-500 font-medium cursor-pointer"
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
                  className="bg-white border border-gray-200 rounded-md px-2 py-0.5 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-emerald-500 font-medium cursor-pointer"
                  title="End Date"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons Group (kept together as one unit) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isFetching}
              className="h-9 flex items-center gap-1.5 px-3 text-xs sm:text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition font-medium cursor-pointer disabled:opacity-60 whitespace-nowrap"
              title="Refresh Report Metrics"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-emerald-600" : ""}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleCopySnapshot}
              disabled={!data || isFetching || isCopyingSnapshot}
              className={`h-9 flex items-center gap-1.5 px-3 text-xs sm:text-sm rounded-xl border transition font-medium cursor-pointer disabled:opacity-60 whitespace-nowrap ${
                snapshotCopied
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
              title="Capture full EOD report & leaderboard as image and copy to clipboard"
            >
              {snapshotCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Camera className={`w-3.5 h-3.5 text-slate-600 ${isCopyingSnapshot ? "animate-pulse" : ""}`} />
                  <span>{isCopyingSnapshot ? "Capturing..." : "Copy Snapshot"}</span>
                </>
              )}
            </button>
            <button
              onClick={handleExport}
              className="h-9 flex items-center gap-1.5 px-3.5 text-xs sm:text-sm text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition font-semibold shadow-xs cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
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
