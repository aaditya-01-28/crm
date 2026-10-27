"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PhoneCall,
  Phone,
  MessageCircle,
  Clock,
  User,
  Building2,
  Download,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  PhoneOff,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers,
  HelpCircle,
  X,
  Copy,
  Check,
} from "lucide-react";
import {
  formatDateTime,
  formatDuration,
  buildTelLink,
  buildWALink,
  WA_PITCH,
  cn,
} from "@/lib/utils";
import { useSession } from "@/components/layout/SessionProvider";
import { LeadDetailModal } from "@/components/leads/LeadDetailModal";
import { AudioRecordingPlayer } from "@/components/calls/AudioRecordingPlayer";
import { toast } from "sonner";

interface CallLogItem {
  id: string;
  leadId: string;
  repId: string;
  disposition: string;
  durationSeconds: number;
  remark: string | null;
  recordingUrl?: string | null;
  callTimestamp: string;
  lead: {
    id: string;
    phoneNumber: string;
    contactName: string | null;
    companyName: string | null;
    businessVertical: string | null;
    status: string;
  };
  rep: {
    id: string;
    fullName: string;
    email: string;
  };
}

interface CallsResponse {
  calls: CallLogItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalCalls: number;
    connectedCalls: number;
    connectedRate: number;
    totalDurationSeconds: number;
    avgDurationSeconds: number;
  };
}

const DISPOSITION_BADGES: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  Connected: {
    label: "Connected",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  RNR: {
    label: "Ringing No Response",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  Callback: {
    label: "Callback Requested",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  "Demo Scheduled": {
    label: "Demo Scheduled",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
  },
  "Not Interested": {
    label: "Not Interested",
    bg: "bg-gray-100",
    text: "text-gray-700",
    border: "border-gray-200",
  },
  "Already Using Our Service": {
    label: "Already Using Our Service",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  "Already Using": {
    label: "Already Using Our Service",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  "Already Purchased or Using Other Company Service": {
    label: "Already Purchased / Other Company",
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
  },
  "Future Requirement": {
    label: "Future Requirement",
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200",
  },
  Invalid: {
    label: "Invalid Number",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
};

export default function CallLogsPage() {
  const { role } = useSession();
  const isManagerOrAdmin = role === "super_admin" || role === "sales_manager";

  // Filter state
  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "7d" | "30d" | "all" | "custom">("today");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [selectedRep, setSelectedRep] = useState("all");
  const [selectedDisposition, setSelectedDisposition] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [recordedOnly, setRecordedOnly] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showAndroidModal, setShowAndroidModal] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Compute dateFrom and dateTo based on filter
  function getDateParams() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dateFilter === "today") {
      return { dateFrom: today.toISOString() };
    }
    if (dateFilter === "yesterday") {
      const yesterdayStart = new Date(today);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const yesterdayEnd = new Date(today);
      yesterdayEnd.setMilliseconds(-1);
      return {
        dateFrom: yesterdayStart.toISOString(),
        dateTo: yesterdayEnd.toISOString(),
      };
    }
    if (dateFilter === "7d") {
      const past7 = new Date(today);
      past7.setDate(past7.getDate() - 7);
      return { dateFrom: past7.toISOString() };
    }
    if (dateFilter === "30d") {
      const past30 = new Date(today);
      past30.setDate(past30.getDate() - 30);
      return { dateFrom: past30.toISOString() };
    }
    if (dateFilter === "custom") {
      return {
        ...(customDateFrom ? { dateFrom: customDateFrom } : {}),
        ...(customDateTo ? { dateTo: customDateTo } : {}),
      };
    }
    return {};
  }

  const { dateFrom, dateTo } = getDateParams();

  // Fetch Team members for Rep dropdown if manager/admin
  const { data: teamData } = useQuery({
    queryKey: ["team-list"],
    queryFn: async () => {
      const res = await fetch("/api/team");
      if (!res.ok) return { users: [] };
      return res.json();
    },
    enabled: isManagerOrAdmin,
  });

  // Fetch Call Logs
  const { data, isLoading, isFetching, refetch } = useQuery<CallsResponse>({
    queryKey: [
      "call-logs",
      page,
      selectedRep,
      selectedDisposition,
      search,
      dateFrom,
      dateTo,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "50");
      if (selectedRep !== "all") params.set("repId", selectedRep);
      if (selectedDisposition !== "all") params.set("disposition", selectedDisposition);
      if (search.trim()) params.set("search", search.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/calls?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch call logs");
      return res.json();
    },
    refetchInterval: 30000, // Live poll every 30s
  });

  const calls = data?.calls || [];
  const displayedCalls = recordedOnly ? calls.filter((c) => Boolean(c.recordingUrl)) : calls;
  const summary = data?.summary || {
    totalCalls: 0,
    connectedCalls: 0,
    connectedRate: 0,
    totalDurationSeconds: 0,
    avgDurationSeconds: 0,
  };
  const pagination = data?.pagination || { page: 1, limit: 50, total: 0, totalPages: 1 };

  // CSV Exporter
  function handleExportCSV() {
    if (!isManagerOrAdmin) {
      toast.error("Export is restricted to Sales Managers and Super Admins.");
      return;
    }
    if (calls.length === 0) {
      toast.error("No call records to export");
      return;
    }

    const headers = [
      "Call Timestamp",
      "Lead Phone",
      "Contact Name",
      "Company Name",
      "Representative",
      "Disposition",
      "Duration (Sec)",
      "Duration (Formatted)",
      "Remarks",
    ];

    const rows = calls.map((c) => [
      `"${c.callTimestamp}"`,
      `"${c.lead.phoneNumber}"`,
      `"${c.lead.contactName || ""}"`,
      `"${c.lead.companyName || ""}"`,
      `"${c.rep.fullName}"`,
      `"${c.disposition}"`,
      c.durationSeconds,
      `"${formatDuration(c.durationSeconds)}"`,
      `"${(c.remark || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `call-logs-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    toast.success("Call logs exported to CSV ✅");
  }

  function handleCopyCurl() {
    const curlCommand = `curl -X POST https://YOUR_CRM_DOMAIN/api/calls \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <USER_JWT_TOKEN>" \\
  -d '{
    "phoneNumber": "9902101007",
    "durationSeconds": 145,
    "disposition": "Connected",
    "callTimestamp": "${new Date().toISOString()}",
    "remark": "Call synced from Android SIM dialer"
  }'`;
    navigator.clipboard.writeText(curlCommand);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
    toast.success("API snippet copied to clipboard");
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                Call Logs & Telephony
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Real-time tracking of dialed numbers, connected times, talk duration, and call outcomes
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowAndroidModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl transition shadow-xs"
          >
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <span>Mobile Companion Sync</span>
          </button>

          {isManagerOrAdmin && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-xl transition shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-gray-500" />
              <span>Export CSV</span>
            </button>
          )}

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-xl transition shadow-xs disabled:opacity-50"
            title="Refresh logs"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin text-emerald-600")} />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
            <span>Total Calls</span>
            <Phone className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {summary.totalCalls.toLocaleString("en-IN")}
          </p>
          <span className="text-[11px] text-gray-400 mt-0.5 block">Recorded attempts</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
            <span>Connected</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-2">
            {summary.connectedCalls.toLocaleString("en-IN")}
          </p>
          <span className="text-[11px] text-emerald-600/80 font-medium mt-0.5 block">
            {summary.connectedRate}% connection rate
          </span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
            <span>Total Talk Time</span>
            <Clock className="w-4 h-4 text-teal-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {formatDuration(summary.totalDurationSeconds)}
          </p>
          <span className="text-[11px] text-gray-400 mt-0.5 block">Cumulative conversation</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
            <span>Avg Talk Duration</span>
            <Layers className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {formatDuration(summary.avgDurationSeconds)}
          </p>
          <span className="text-[11px] text-gray-400 mt-0.5 block">Per call average</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
            <span>No Answer (RNR)</span>
            <PhoneOff className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-2">
            {(summary.totalCalls - summary.connectedCalls).toLocaleString("en-IN")}
          </p>
          <span className="text-[11px] text-gray-400 mt-0.5 block">Ringing / Not picked</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Date presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "7d", label: "Last 7 Days" },
              { id: "30d", label: "Last 30 Days" },
              { id: "all", label: "All Time" },
              { id: "custom", label: "Custom Date" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setDateFilter(p.id as any);
                  setPage(1);
                }}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap",
                  dateFilter === p.id
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200/80"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search phone, company, contact..."
              className="w-full text-xs pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-gray-800"
            />
          </div>
        </div>

        {/* Custom date range picker (if custom selected) */}
        {dateFilter === "custom" && (
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">From:</span>
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => {
                  setCustomDateFrom(e.target.value);
                  setPage(1);
                }}
                className="text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">To:</span>
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => {
                  setCustomDateTo(e.target.value);
                  setPage(1);
                }}
                className="text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        )}

        {/* Dropdown Filters (Disposition & Representative) */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 font-medium">Disposition:</span>
            <select
              value={selectedDisposition}
              onChange={(e) => {
                setSelectedDisposition(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Dispositions</option>
              <option value="Connected">Connected</option>
              <option value="RNR">RNR (Ringing No Response)</option>
              <option value="Callback">Callback</option>
              <option value="Demo Scheduled">Demo Scheduled</option>
              <option value="Not Interested">Not Interested</option>
              <option value="Already Using Our Service">Already Using Our Service</option>
              <option value="Already Purchased or Using Other Company Service">Already Purchased or Using Other Company Service</option>
              <option value="Future Requirement">Future Requirement</option>
              <option value="Invalid">Invalid</option>
            </select>
          </div>

          {isManagerOrAdmin && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 font-medium">Representative:</span>
              <select
                value={selectedRep}
                onChange={(e) => {
                  setSelectedRep(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Team Members (Aggregated)</option>
                {(teamData?.users || []).some((u: any) => u.role === "sales_manager") && (
                  <optgroup label="Level 2 • Sales Managers">
                    {(teamData?.users || [])
                      .filter((u: any) => u.role === "sales_manager")
                      .map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} (Manager)
                        </option>
                      ))}
                  </optgroup>
                )}
                {(teamData?.users || []).some((u: any) => u.role === "sales_rep") && (
                  <optgroup label="Level 1 • Sales Representatives">
                    {(teamData?.users || [])
                      .filter((u: any) => u.role === "sales_rep")
                      .map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} (Rep)
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => setRecordedOnly(!recordedOnly)}
            className={cn(
              "px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer",
              recordedOnly
                ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            )}
          >
            <span>🎙️ With Call Recording</span>
            {calls.filter((c) => Boolean(c.recordingUrl)).length > 0 && (
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                  recordedOnly ? "bg-emerald-800 text-white" : "bg-emerald-100 text-emerald-800"
                )}
              >
                {calls.filter((c) => Boolean(c.recordingUrl)).length}
              </span>
            )}
          </button>

          <div className="ml-auto text-gray-400 font-medium">
            Showing {calls.length} of {pagination.total} calls
          </div>
        </div>
      </div>

      {/* Main Call Log Table */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs text-gray-500 font-medium">Retrieving call logs...</p>
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-gray-400">
              <PhoneCall className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-gray-800">No Call Logs Found</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
              No calls match the selected date or filters. Start calling prospects from the dialer
              or sync calls from the Android companion app.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50/75 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Connected Time</th>
                  <th className="py-3.5 px-4">Prospect / Lead</th>
                  <th className="py-3.5 px-4">Representative</th>
                  <th className="py-3.5 px-4 text-center">Status / Outcome</th>
                  <th className="py-3.5 px-4 text-center">Talk Duration</th>
                  <th className="py-3.5 px-4">Call Audio / QA Audit</th>
                  <th className="py-3.5 px-4">Notes & Remarks</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {displayedCalls.map((call) => {
                  const badge = DISPOSITION_BADGES[call.disposition] || {
                    label: call.disposition,
                    bg: "bg-gray-50",
                    text: "text-gray-700",
                    border: "border-gray-200",
                  };
                  const telLink = buildTelLink(call.lead.phoneNumber);
                  const waLink = buildWALink(call.lead.phoneNumber, WA_PITCH);

                  return (
                    <tr
                      key={call.id}
                      className="hover:bg-slate-50/80 transition group"
                    >
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-semibold text-gray-900">
                          {formatDateTime(call.callTimestamp)}
                        </div>
                        <span className="text-[10px] text-gray-400">SIM Outbound</span>
                      </td>

                      {/* Lead / Prospect */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => setSelectedLeadId(call.lead.id)}
                            className="font-bold text-gray-900 hover:text-emerald-600 text-left transition flex items-center gap-1"
                          >
                            <span>{call.lead.companyName || "Personal Contact"}</span>
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition text-emerald-600" />
                          </button>

                          <div className="flex items-center gap-1.5 text-gray-500 mt-0.5">
                            {call.lead.contactName && (
                              <span className="text-gray-600 font-medium">
                                {call.lead.contactName} •
                              </span>
                            )}
                            <span className="font-mono text-gray-600">{call.lead.phoneNumber}</span>
                          </div>

                          {call.lead.businessVertical && (
                            <span className="text-[10px] text-gray-400 mt-0.5">
                              Vertical: {call.lead.businessVertical}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Rep */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[10px]">
                            {call.rep.fullName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800 leading-tight">
                              {call.rep.fullName}
                            </p>
                            <p className="text-[10px] text-gray-400 leading-tight">
                              {call.rep.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Disposition */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-full font-semibold border text-xs shadow-2xs",
                            badge.bg,
                            badge.text,
                            badge.border
                          )}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {call.durationSeconds > 0 ? (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-mono font-semibold border border-emerald-200">
                            <Clock className="w-3 h-3" />
                            {formatDuration(call.durationSeconds)}
                          </div>
                        ) : (
                          <span className="text-gray-400 font-mono">0s</span>
                        )}
                      </td>

                      {/* Call Audio / QA Audit */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {call.recordingUrl ? (
                          <AudioRecordingPlayer
                            recordingUrl={call.recordingUrl}
                            durationSeconds={call.durationSeconds}
                          />
                        ) : (
                          <span className="text-[11px] text-gray-400 italic flex items-center gap-1">
                            <PhoneOff className="w-3 h-3 text-gray-300" />
                            No recording
                          </span>
                        )}
                      </td>

                      {/* Remarks */}
                      <td className="py-3.5 px-4 max-w-xs">
                        {call.remark ? (
                          <p className="text-gray-600 line-clamp-2 bg-gray-50 p-2 rounded-lg border border-gray-100/80">
                            {call.remark}
                          </p>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">No notes</span>
                        )}
                      </td>

                      {/* Quick Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={telLink}
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Call Prospect"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                            title="WhatsApp Pitch"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                          <button
                            type="button"
                            onClick={() => setSelectedLeadId(call.lead.id)}
                            className="px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-slate-900 hover:text-white rounded-lg transition"
                          >
                            Dossier
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-600">
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 font-medium flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 font-medium flex items-center gap-1"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lead Dossier Modal */}
      {selectedLeadId && (
        <LeadDetailModal
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onLeadUpdated={() => refetch()}
        />
      )}

      {/* Android Mobile Companion Setup Modal */}
      {showAndroidModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-600 text-white rounded-xl">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Android Companion App (100% Free SIM Tracking)
                  </h3>
                  <p className="text-xs text-gray-500">
                    Proprietary background service for sales representatives
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAndroidModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-gray-600">
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5">
                <p className="font-semibold text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Zero Third-Party Call Charges
                </p>
                <p className="text-emerald-800 leading-relaxed">
                  The Android companion app runs on sales reps&apos; devices, uses their standard SIM
                  unlimited voice plan, and reads the native telecom log (
                  <code className="bg-emerald-100 text-emerald-900 px-1 rounded">CallLog.Calls</code>
                  ) to record exact connected seconds and timestamps without paying telephony fees.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-gray-800 uppercase tracking-wide text-[11px]">
                  How to sync calls from phone to this dashboard:
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-gray-700">
                  <li>
                    <strong>Install APK:</strong> Install the Textora Companion App on the sales
                    rep&apos;s Android phone.
                  </li>
                  <li>
                    <strong>Grant Permission:</strong> Enable{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-gray-800">
                      READ_CALL_LOG
                    </code>{" "}
                    when prompted.
                  </li>
                  <li>
                    <strong>Automatic Pushes:</strong> Every outbound call made by the rep
                    automatically sends a POST request with the exact duration to{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-gray-800">
                      /api/calls
                    </code>
                    .
                  </li>
                </ol>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-800 text-[11px] uppercase tracking-wide">
                    API Endpoint Specification
                  </span>
                  <button
                    onClick={handleCopyCurl}
                    className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    {copiedCurl ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy cURL
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-slate-950 text-slate-200 rounded-xl font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800">
{`POST /api/calls
Authorization: Bearer <USER_JWT_TOKEN>
Content-Type: application/json

{
  "phoneNumber": "9902101007",
  "durationSeconds": 145,
  "disposition": "Connected",
  "callTimestamp": "${new Date().toISOString()}",
  "remark": "Call synced from Android SIM dialer"
}`}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowAndroidModal(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-semibold text-xs hover:bg-slate-800 transition shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
