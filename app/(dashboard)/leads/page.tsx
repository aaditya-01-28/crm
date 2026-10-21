"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Contact,
  Search,
  Filter,
  Phone,
  MessageCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  Download,
  RefreshCw,
  Plus,
  Eye,
  CheckCircle2,
  AlertCircle,
  X,
  User,
  Languages,
  Trash2,
} from "lucide-react";
import {
  buildTelLink,
  buildWALink,
  WA_PITCH,
  formatDateTime,
  cn,
  SERVICE_INTERESTS,
  LEAD_LANGUAGES,
  getLanguageMeta,
  formatLanguageLabels,
  parseServices,
} from "@/lib/utils";
import { MultiServiceSelect } from "@/components/common/MultiServiceSelect";
import { LeadDetailModal } from "@/components/leads/LeadDetailModal";
import { CSVImporter } from "@/components/dialer/CSVImporter";
import { toast } from "sonner";
import { useCanImportLeads, useCanAssignLeads, useIsAdmin } from "@/components/layout/SessionProvider";

interface LastCallLog {
  disposition: string;
  remark: string | null;
  durationSeconds: number;
  callTimestamp: string;
  rep: { fullName: string };
}

interface LeadRecord {
  id: string;
  phoneNumber: string;
  contactName: string | null;
  companyName: string | null;
  websiteUrl: string | null;
  businessVertical: string | null;
  serviceType: string | null;
  preferredLanguage?: string | null;
  source: string;
  status: string;
  rnrCount: number;
  batchDate: string;
  createdAt: string;
  updatedAt: string;
  assignedRep: { id: string; fullName: string } | null;
  firstAssignedRep?: { id: string; fullName: string } | null;
  firstAssignedAt?: string | null;
  callLogs: LastCallLog[];
  _count: {
    callLogs: number;
    tasks: number;
    deals: number;
  };
}

interface LeadsResponse {
  leads: LeadRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: Record<string, number>;
}

const STATUS_FILTERS = [
  { key: "all", label: "All Leads" },
  { key: "new", label: "New" },
  { key: "callback", label: "Callbacks" },
  { key: "demo_scheduled", label: "Demos" },
  { key: "demo_done", label: "Demo Done" },
  { key: "deal_created", label: "In Deal" },
  { key: "won", label: "Won 🏆" },
  { key: "lost", label: "Lost" },
  { key: "rnr", label: "RNR" },
  { key: "not_interested", label: "Not Interested" },
  { key: "already_using", label: "Already Purchased / Other" },
  { key: "future_requirement", label: "Future Requirement" },
];

const VERTICALS = [
  "All Verticals",
  "Pathlab",
  "Real Estate",
  "EdTech",
  "Gym",
  "Retail",
  "Healthcare",
  "Logistics",
  "E-Commerce",
  "Hospitality",
];

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "bg-blue-100 text-blue-700 border-blue-200" },
  callback: { label: "Callback", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  demo_scheduled: { label: "Demo Booked", color: "bg-purple-100 text-purple-700 border-purple-200" },
  demo_done: { label: "Demo Done", color: "bg-teal-100 text-teal-700 border-teal-200" },
  deal_created: { label: "Deal Created", color: "bg-amber-100 text-amber-700 border-amber-200" },
  won: { label: "Closed Won", color: "bg-green-100 text-green-700 border-green-200" },
  lost: { label: "Closed Lost", color: "bg-red-100 text-red-700 border-red-200" },
  rnr: { label: "RNR", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  not_interested: { label: "Not Interested", color: "bg-gray-100 text-gray-600 border-gray-200" },
  already_using: { label: "Already Purchased or Using Other Service", color: "bg-orange-100 text-orange-700 border-orange-200" },
  already_purchased: { label: "Already Purchased or Using Other Service", color: "bg-orange-100 text-orange-700 border-orange-200" },
  future_requirement: { label: "Future Requirement", color: "bg-sky-100 text-sky-800 border-sky-200" },
  invalid: { label: "Invalid", color: "bg-rose-100 text-rose-700 border-rose-200" },
};

export default function LeadsDirectoryPage() {
  const [activeStatus, setActiveStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [vertical, setVertical] = useState("All Verticals");
  const [page, setPage] = useState(1);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showImporter, setShowImporter] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const canImport = useCanImportLeads();
  const canAssign = useCanAssignLeads();
  const isLevel3Admin = useIsAdmin();
  const queryClient = useQueryClient();

  // Deletion state (Level 3 Super Admin only)
  const [deletingLead, setDeletingLead] = useState<LeadRecord | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSingleDelete = async () => {
    if (!deletingLead) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/leads/${deletingLead.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete lead");
      toast.success("Lead permanently deleted ✅");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setDeletingLead(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete lead");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLeadIds.length === 0) return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedLeadIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete leads");
      toast.success(`Permanently deleted ${data.count || selectedLeadIds.length} leads ✅`);
      setSelectedLeadIds([]);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setShowBulkDeleteConfirm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete leads");
    } finally {
      setIsDeleting(false);
    }
  };

  // Refresh & bulk selection state
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [isSelectingAllCategory, setIsSelectingAllCategory] = useState(false);

  // Bulk assignment & Rep filter state (Level 2/3 Manager/Admin feature)
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedRepFilter, setSelectedRepFilter] = useState("all");
  const [bulkTargetRepId, setBulkTargetRepId] = useState("");
  const [assigningBulk, setAssigningBulk] = useState(false);

  // New Lead Modal state
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newVertical, setNewVertical] = useState("");
  const [newServices, setNewServices] = useState<string[]>(["WhatsApp API"]);
  const [newLanguage, setNewLanguage] = useState("");
  const [savingLead, setSavingLead] = useState(false);

  // Fetch active sales reps for assignment
  const { data: teamData } = useQuery({
    queryKey: ["team-reps"],
    queryFn: async () => {
      const res = await fetch("/api/team");
      if (!res.ok) return { users: [] };
      return res.json();
    },
    enabled: canAssign,
  });

  const teamReps: Array<{ id: string; fullName: string; role: string; language?: string; isActive?: boolean }> =
    (teamData?.users || []).filter(
      (u: { role: string; isActive?: boolean }) => ["sales_rep", "sales_manager"].includes(u.role) && u.isActive !== false
    );

  const { data, isLoading, isFetching, refetch } = useQuery<LeadsResponse>({
    queryKey: ["leads-directory", activeStatus, vertical, search, selectedRepFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "25",
        status: activeStatus,
        ...(vertical !== "All Verticals" ? { vertical } : {}),
        ...(search ? { search } : {}),
        ...(selectedRepFilter !== "all" ? { repId: selectedRepFilter } : {}),
        _t: Date.now().toString(),
      });
      const res = await fetch(`/api/leads?${params.toString()}`, {
        cache: "no-store",
        headers: {
          Pragma: "no-cache",
          "Cache-Control": "no-cache",
        },
      });
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json();
    },
  });

  const leads = data?.leads || [];
  const stats = data?.stats || {};
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  async function handleRefresh() {
    setIsManualRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["leads-directory"] });
      await refetch();
      toast.success("Leads refreshed directly from database! 🔄");
    } catch {
      toast.error("Failed to refresh leads");
    } finally {
      setIsManualRefreshing(false);
    }
  }

  const allCategorySelected = total > 0 && selectedLeadIds.length >= total;
  const isPartiallySelected = selectedLeadIds.length > 0 && !allCategorySelected;

  async function toggleSelectAllCategory() {
    if (total === 0) return;

    if (allCategorySelected) {
      setSelectedLeadIds([]);
      toast.info("Cleared selection");
      return;
    }

    if (total <= leads.length) {
      const allIds = leads.map((l) => l.id);
      setSelectedLeadIds(allIds);
      toast.success(`Selected all ${allIds.length} leads in this category! ✅`);
      return;
    }

    setIsSelectingAllCategory(true);
    try {
      const params = new URLSearchParams({
        allIds: "true",
        status: activeStatus,
        ...(vertical !== "All Verticals" ? { vertical } : {}),
        ...(search ? { search } : {}),
        ...(selectedRepFilter !== "all" ? { repId: selectedRepFilter } : {}),
        _t: Date.now().toString(),
      });
      const res = await fetch(`/api/leads?${params.toString()}`, {
        cache: "no-store",
        headers: { Pragma: "no-cache", "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error("Failed to load lead IDs");
      const result = await res.json();
      const ids: string[] = result.ids || [];
      setSelectedLeadIds(ids);
      toast.success(`Selected all ${ids.length} leads in this category! ✅`);
    } catch {
      toast.error("Failed to select all leads in this category");
    } finally {
      setIsSelectingAllCategory(false);
    }
  }

  function toggleSelectLead(id: string) {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  async function handleBulkAssign(mode: "specific" | "round_robin" | "unassign") {
    if (selectedLeadIds.length === 0) return;
    if (mode === "specific" && !bulkTargetRepId) {
      toast.error("Please select a sales representative to assign to.");
      return;
    }
    setAssigningBulk(true);
    try {
      const payload: Record<string, unknown> = {
        leadIds: selectedLeadIds,
      };
      if (mode === "round_robin") {
        payload.mode = "round_robin";
      } else if (mode === "unassign") {
        payload.repId = "unassigned";
      } else {
        payload.repId = bulkTargetRepId;
      }

      const res = await fetch("/api/leads/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Bulk assign failed");

      toast.success(result.message || "Leads assigned successfully! ✅");
      setSelectedLeadIds([]);
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to assign leads";
      toast.error(message);
    } finally {
      setAssigningBulk(false);
    }
  }

  async function handleCreateLead(e: React.FormEvent) {
    e.preventDefault();
    if (!newPhone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    setSavingLead(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: newPhone,
          contactName: newName || null,
          companyName: newCompany || null,
          businessVertical: newVertical || null,
          serviceType: newServices.join(", ") || null,
          preferredLanguage: newLanguage || null,
          source: "Manual Rep Entry",
        }),
      });
      if (!res.ok) throw new Error("Failed to create lead");
      toast.success("Lead created successfully ✅");
      setShowAddModal(false);
      setNewPhone("");
      setNewName("");
      setNewCompany("");
      setNewVertical("");
      setNewServices(["WhatsApp API"]);
      setNewLanguage("");
      refetch();
    } catch {
      toast.error("Failed to create lead");
    } finally {
      setSavingLead(false);
    }
  }

  function handleExportCSV() {
    if (!canAssign) {
      toast.error("Export is restricted to Sales Managers and Super Admins.");
      return;
    }
    if (leads.length === 0) {
      toast.error("No leads to export");
      return;
    }
    const headers = [
      "Company Name",
      "Contact Person",
      "Phone Number",
      "Vertical",
      "Service",
      "Status",
      "Total Calls",
      "Last Disposition",
      "Last Interaction Time",
      "Last Remark",
      "Assigned Rep",
    ];

    const rows = leads.map((l) => {
      const lastLog = l.callLogs?.[0];
      return [
        `"${l.companyName || ""}"`,
        `"${l.contactName || ""}"`,
        `"${l.phoneNumber}"`,
        `"${l.businessVertical || ""}"`,
        `"${l.serviceType || ""}"`,
        `"${l.status}"`,
        l._count.callLogs,
        `"${lastLog?.disposition || "None"}"`,
        `"${lastLog ? formatDateTime(lastLog.callTimestamp) : "Never"}"`,
        `"${(lastLog?.remark || "").replace(/"/g, '""')}"`,
        `"${l.assignedRep?.fullName || "Unassigned"}"`,
      ];
    });

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `textora-leads-report-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Contact className="w-6 h-6 text-emerald-600" />
            Leads Directory & Activity Reports
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review all assigned leads, past interaction records, and call history
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isFetching || isManualRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition shadow-xs font-medium cursor-pointer disabled:opacity-60"
            title="Fetch latest leads instantly from database"
          >
            <RefreshCw
              className={cn(
                "w-4 h-4 text-emerald-600",
                (isFetching || isManualRefreshing) && "animate-spin"
              )}
            />
            <span>{isFetching || isManualRefreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
          {canAssign && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition shadow-xs"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
          {canImport && (
            <>
              <button
                onClick={() => setShowImporter(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition shadow-xs font-medium"
              >
                Import Batch
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition shadow-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                Add Lead
              </button>
            </>
          )}
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin items-center">
        {canAssign && (
          <button
            onClick={() => {
              if (selectedRepFilter === "unassigned") {
                setSelectedRepFilter("all");
              } else {
                setSelectedRepFilter("unassigned");
                setActiveStatus("all");
              }
              setPage(1);
              setSelectedLeadIds([]);
            }}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition flex items-center gap-1.5 border",
              selectedRepFilter === "unassigned"
                ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                : "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
            )}
          >
            <span>Unassigned Pool</span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-[11px]",
                selectedRepFilter === "unassigned"
                  ? "bg-white/20 text-white"
                  : "bg-amber-200 text-amber-900"
              )}
            >
              {stats.unassigned ?? 0}
            </span>
          </button>
        )}

        {STATUS_FILTERS.map((tab) => {
          const count = stats[tab.key] ?? 0;
          const active = activeStatus === tab.key && selectedRepFilter !== "unassigned";
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveStatus(tab.key);
                if (selectedRepFilter === "unassigned") setSelectedRepFilter("all");
                setPage(1);
                setSelectedLeadIds([]);
              }}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition flex items-center gap-1.5 border",
                active
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-full text-[11px]",
                  active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-xs flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
              setSelectedLeadIds([]);
            }}
            placeholder="Search leads by company, contact person, phone number..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50"
          />
        </div>

        {/* Assignee dropdown filter (Level 2/3 Manager/Admin only) */}
        {canAssign && (
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            <select
              value={selectedRepFilter}
              onChange={(e) => {
                setSelectedRepFilter(e.target.value);
                setPage(1);
                setSelectedLeadIds([]);
              }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All Assignees</option>
              <option value="unassigned">⚠️ Unassigned Leads Only</option>
              {teamReps.some((r) => r.role === "sales_manager") && (
                <optgroup label="Level 2 • Sales Managers">
                  {teamReps
                    .filter((r) => r.role === "sales_manager")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.fullName} (Manager)
                      </option>
                    ))}
                </optgroup>
              )}
              {teamReps.some((r) => r.role === "sales_rep") && (
                <optgroup label="Level 1 • Sales Representatives">
                  {teamReps
                    .filter((r) => r.role === "sales_rep")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.fullName} (Rep)
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>
        )}

        {/* Vertical dropdown */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={vertical}
            onChange={(e) => {
              setVertical(e.target.value);
              setPage(1);
              setSelectedLeadIds([]);
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {VERTICALS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Contact className="w-12 h-12 mx-auto mb-3 opacity-30 text-gray-400" />
            <p className="font-semibold text-gray-700">No leads found in this view</p>
            <p className="text-xs text-gray-500 mt-1">
              Try adjusting your search query, status tab, or import a new lead batch.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-200 text-xs text-gray-500 font-semibold uppercase tracking-wider">
                <tr>
                  {canAssign && (
                    <th className="w-10 px-4 py-3.5">
                      <input
                        type="checkbox"
                        ref={(el) => {
                          if (el) {
                            el.indeterminate = isPartiallySelected;
                          }
                        }}
                        checked={allCategorySelected}
                        onChange={toggleSelectAllCategory}
                        disabled={total === 0 || isSelectingAllCategory}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40"
                        title={
                          allCategorySelected
                            ? "Deselect all leads in this category"
                            : `Select all ${total} leads in this category`
                        }
                      />
                    </th>
                  )}
                  <th className="px-5 py-3.5">Company / Contact</th>
                  <th className="px-4 py-3.5">Quick Call & WhatsApp</th>
                  <th className="px-4 py-3.5">Vertical & Service</th>
                  <th className="px-4 py-3.5">Current Status</th>
                  <th className="px-5 py-3.5">Last Interaction Report</th>
                  <th className="px-4 py-3.5">Assigned Rep</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead) => {
                  const lastLog = lead.callLogs?.[0];
                  const statusBadge = STATUS_BADGES[lead.status] || {
                    label: lead.status,
                    color: "bg-gray-100 text-gray-700 border-gray-200",
                  };
                  const telLink = buildTelLink(lead.phoneNumber);
                  const waLink = buildWALink(lead.phoneNumber, WA_PITCH);
                  const isSelected = selectedLeadIds.includes(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      className={cn(
                        "hover:bg-emerald-50/40 transition group cursor-pointer",
                        isSelected && "bg-emerald-50/70"
                      )}
                      onClick={() => setSelectedLeadId(lead.id)}
                    >
                      {canAssign && (
                        <td className="w-10 px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectLead(lead.id)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </td>
                      )}
                      {/* Company & Contact */}
                      <td className="px-5 py-4">
                        <div className="font-bold text-gray-900 group-hover:text-emerald-600 transition">
                          {lead.companyName || "Personal Lead"}
                        </div>
                        {lead.contactName ? (
                          <div className="text-xs text-gray-500 font-medium">
                            {lead.contactName}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 italic">No contact name</div>
                        )}
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          Source: {lead.source}
                        </div>
                      </td>

                      {/* Quick Call & WhatsApp CTA buttons */}
                      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <a
                            href={telLink}
                            title={`Call +91 ${lead.phoneNumber}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-semibold text-xs transition"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>{lead.phoneNumber}</span>
                          </a>
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Send Intro pitch via WhatsApp Web/App"
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 transition"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        </div>
                      </td>

                      {/* Vertical & Service */}
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1 items-start">
                          {lead.businessVertical ? (
                            <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                              {lead.businessVertical}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                          {lead.serviceType && (
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {parseServices(lead.serviceType).map((st) => (
                                <span
                                  key={st}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium border border-gray-200"
                                >
                                  {st}
                                </span>
                              ))}
                            </div>
                          )}
                          {lead.preferredLanguage && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1">
                              <Languages className="w-2.5 h-2.5 text-indigo-500" />
                              {formatLanguageLabels(lead.preferredLanguage) || lead.preferredLanguage}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Current Status */}
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center text-xs px-2.5 py-1 rounded-full font-semibold border",
                            statusBadge.color
                          )}
                        >
                          {statusBadge.label}
                        </span>
                        {lead.rnrCount > 0 && lead.status !== "won" && (
                          <div className="text-[11px] text-amber-700 mt-1 font-medium">
                            {lead.rnrCount} RNR attempts
                          </div>
                        )}
                      </td>

                      {/* Last Interaction Report */}
                      <td className="px-5 py-4">
                        {lastLog ? (
                          <div className="space-y-1 max-w-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-800 border border-gray-200">
                                {lastLog.disposition}
                              </span>
                              <span className="text-[11px] text-gray-400">
                                {formatDateTime(lastLog.callTimestamp)}
                              </span>
                            </div>
                            {lastLog.remark ? (
                              <p className="text-xs text-gray-600 truncate" title={lastLog.remark}>
                                "{lastLog.remark}"
                              </p>
                            ) : (
                              <p className="text-[11px] text-gray-400 italic">No remark recorded</p>
                            )}
                            <div className="text-[11px] text-gray-400">
                              Total interactions: <strong className="text-gray-700">{lead._count.callLogs}</strong>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 italic flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 opacity-60" />
                            Never contacted
                          </div>
                        )}
                      </td>

                      {/* Assigned Rep */}
                      <td className="px-4 py-4 text-xs font-medium text-gray-700">
                        {lead.assignedRep ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-gray-800">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              {lead.assignedRep.fullName}
                            </span>
                            {canAssign && lead.firstAssignedRep && lead.firstAssignedRep.id !== lead.assignedRep.id && (
                              <div>
                                <span
                                  className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60 inline-flex items-center gap-0.5 font-medium"
                                  title={`Initially assigned to ${lead.firstAssignedRep.fullName}`}
                                >
                                  1st: {lead.firstAssignedRep.fullName}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 text-[11px]">
                              Unassigned
                            </span>
                            {canAssign && lead.firstAssignedRep && (
                              <div>
                                <span
                                  className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60 inline-flex items-center gap-0.5 font-medium"
                                  title={`Initially assigned to ${lead.firstAssignedRep.fullName}`}
                                >
                                  1st: {lead.firstAssignedRep.fullName}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => setSelectedLeadId(lead.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition border border-emerald-200"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>History</span>
                            <ChevronRight className="w-3 h-3 opacity-60" />
                          </button>
                          {isLevel3Admin && (
                            <button
                              onClick={() => setDeletingLead(lead)}
                              title="Delete Lead (Admin Only)"
                              className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition border border-transparent hover:border-rose-200"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <div>
              Showing page <strong>{page}</strong> of <strong>{totalPages}</strong> ({total} total leads)
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lead Detail Slide-over / Modal */}
      {selectedLeadId && (
        <LeadDetailModal
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onLeadUpdated={() => refetch()}
        />
      )}

      {/* CSV Importer Modal */}
      {showImporter && (
        <CSVImporter
          onClose={() => setShowImporter(false)}
          onImported={() => {
            setShowImporter(false);
            refetch();
            toast.success("Leads imported successfully!");
          }}
        />
      )}

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Add New Lead</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Phone Number *</label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Company Name</label>
                <input
                  type="text"
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="e.g. Apex Health Diagnostic"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Contact Person</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Dr. Rakesh Sharma"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Vertical</label>
                <select
                  value={newVertical}
                  onChange={(e) => setNewVertical(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Select Vertical...</option>
                  {VERTICALS.filter((v) => v !== "All Verticals").map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <MultiServiceSelect
                  selectedServices={newServices}
                  onChange={setNewServices}
                  label="Interested Services (Multiple selection)"
                  placeholder="+ Add service interest..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">
                  Customer Preferred Language
                </label>
                <select
                  value={newLanguage}
                  onChange={(e) => setNewLanguage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Unspecified (Any Representative)</option>
                  {LEAD_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  Enables smart language-based representative assignment & transfer.
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLead}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {savingLead ? "Saving..." : "Save Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sticky Floating Bulk Assignment Toolbar (Level 2/3 Manager/Admin Feature) */}
      {canAssign && selectedLeadIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700 flex flex-wrap items-center gap-4 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white font-bold text-xs">
              ✓
            </span>
            <span className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <span>{selectedLeadIds.length} lead{selectedLeadIds.length > 1 ? "s" : ""} selected</span>
              {allCategorySelected && (
                <span className="text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  All in Category
                </span>
              )}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* Quick Rep Selector */}
          <div className="flex items-center gap-2">
            <select
              value={bulkTargetRepId}
              onChange={(e) => setBulkTargetRepId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Assign To Team Member...</option>
              {teamReps.some((r) => r.role === "sales_manager") && (
                <optgroup label="Level 2 • Sales Managers">
                  {teamReps
                    .filter((r) => r.role === "sales_manager")
                    .map((rep) => {
                      const repLangMeta = getLanguageMeta(rep.language);
                      return (
                        <option key={rep.id} value={rep.id}>
                          {rep.fullName} (Manager) {repLangMeta ? `(${repLangMeta.flag} ${repLangMeta.label})` : ""}
                        </option>
                      );
                    })}
                </optgroup>
              )}
              {teamReps.some((r) => r.role === "sales_rep") && (
                <optgroup label="Level 1 • Sales Representatives">
                  {teamReps
                    .filter((r) => r.role === "sales_rep")
                    .map((rep) => {
                      const repLangMeta = getLanguageMeta(rep.language);
                      return (
                        <option key={rep.id} value={rep.id}>
                          {rep.fullName} (Rep) {repLangMeta ? `(${repLangMeta.flag} ${repLangMeta.label})` : ""}
                        </option>
                      );
                    })}
                </optgroup>
              )}
            </select>

            <button
              onClick={() => handleBulkAssign("specific")}
              disabled={assigningBulk || !bulkTargetRepId}
              className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              {assigningBulk ? "Assigning..." : "Assign"}
            </button>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* Round Robin Split */}
          <button
            onClick={() => handleBulkAssign("round_robin")}
            disabled={assigningBulk || teamReps.length === 0}
            className="px-3 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            title="Distribute selected leads equally across all active sales reps"
          >
            Round-Robin Split
          </button>

          {/* Unassign */}
          <button
            onClick={() => handleBulkAssign("unassign")}
            disabled={assigningBulk}
            className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition disabled:opacity-50"
          >
            Unassign
          </button>

          {/* Level 3 Super Admin Bulk Delete */}
          {isLevel3Admin && (
            <>
              <div className="h-4 w-px bg-slate-700 hidden sm:block" />
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={isDeleting}
                className="px-3 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                title="Permanently delete selected leads (Admin only)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete ({selectedLeadIds.length})</span>
              </button>
            </>
          )}

          {/* Clear */}
          <button
            onClick={() => setSelectedLeadIds([])}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 transition"
          >
            Clear
          </button>
        </div>
      )}

      {/* Single Delete Confirmation Modal (Level 3 Super Admin Only) */}
      {deletingLead && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">Delete Lead Permanently?</h3>
              <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                Are you sure you want to delete{" "}
                <strong className="text-gray-900">
                  {deletingLead.companyName || deletingLead.contactName || deletingLead.phoneNumber}
                </strong>
                ? This will permanently delete the lead record along with all associated call logs, scheduled tasks,
                deals, and payments. This action <strong>cannot</strong> be undone.
              </p>

              <div className="flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setDeletingLead(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSingleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isDeleting ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal (Level 3 Super Admin Only) */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">
                Delete {selectedLeadIds.length} Selected Leads?
              </h3>
              <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                You are about to permanently delete{" "}
                <strong className="text-rose-600">{selectedLeadIds.length}</strong> selected leads and all their
                associated call logs, scheduled tasks, deals, and records. This action{" "}
                <strong>cannot be reversed</strong>.
              </p>

              <div className="flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isDeleting ? "Deleting..." : `Delete ${selectedLeadIds.length} Leads`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
