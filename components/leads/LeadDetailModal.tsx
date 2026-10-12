"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Phone,
  MessageCircle,
  Clock,
  Video,
  FileText,
  DollarSign,
  Building2,
  User,
  Tag,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Plus,
  Edit3,
  Check,
  Languages,
  UserCheck,
} from "lucide-react";
import {
  buildTelLink,
  buildWALink,
  WA_PITCH,
  formatDateTime,
  formatCurrency,
  cn,
  SERVICE_INTERESTS,
  LEAD_LANGUAGES,
  getLanguageMeta,
  formatLanguageLabels,
  hasLanguageMatch,
} from "@/lib/utils";
import { toast } from "sonner";
import { useCanAssignLeads } from "@/components/layout/SessionProvider";

interface LeadDetailModalProps {
  leadId: string;
  onClose: () => void;
  onLeadUpdated?: () => void;
}

const STATUS_OPTIONS = [
  { value: "new", label: "New Lead", color: "bg-blue-100 text-blue-800" },
  { value: "callback", label: "Callback Required", color: "bg-indigo-100 text-indigo-800" },
  { value: "demo_scheduled", label: "Demo Scheduled", color: "bg-purple-100 text-purple-800" },
  { value: "demo_done", label: "Demo Done", color: "bg-teal-100 text-teal-800" },
  { value: "deal_created", label: "Deal in Pipeline", color: "bg-amber-100 text-amber-800" },
  { value: "won", label: "Closed Won 🏆", color: "bg-green-100 text-green-800" },
  { value: "lost", label: "Closed Lost", color: "bg-red-100 text-red-800" },
  { value: "rnr", label: "Ringing No Response (RNR)", color: "bg-yellow-100 text-yellow-800" },
  { value: "not_interested", label: "Not Interested", color: "bg-gray-100 text-gray-700" },
  { value: "already_using", label: "Already Using", color: "bg-orange-100 text-orange-800" },
  { value: "invalid", label: "Invalid Number", color: "bg-rose-100 text-rose-800" },
];

export function LeadDetailModal({ leadId, onClose, onLeadUpdated }: LeadDetailModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"timeline" | "tasks" | "deals">("timeline");
  const [showLogNote, setShowLogNote] = useState(false);
  const [disposition, setDisposition] = useState("Connected");
  const [remark, setRemark] = useState("");
  const [callbackDatetime, setCallbackDatetime] = useState("");
  const [demoDatetime, setDemoDatetime] = useState("");
  const [decisionMakerName, setDecisionMakerName] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [submittingLog, setSubmittingLog] = useState(false);
  const canAssign = useCanAssignLeads();

  const { data, isLoading } = useQuery({
    queryKey: ["lead-detail", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}`);
      if (!res.ok) throw new Error("Failed to fetch lead details");
      return res.json();
    },
  });

  const { data: teamData } = useQuery({
    queryKey: ["team-reps"],
    queryFn: async () => {
      const res = await fetch("/api/team");
      if (!res.ok) return { users: [] };
      return res.json();
    },
    enabled: canAssign,
  });

  const teamReps = (teamData?.users || []).filter(
    (u: { role: string; isActive?: boolean }) => u.role === "sales_rep" && u.isActive !== false
  );

  const lead = data?.lead;

  // Edit lead info state
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editContactName, setEditContactName] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editVertical, setEditVertical] = useState("");
  const [editService, setEditService] = useState("");
  const [editLanguage, setEditLanguage] = useState("");
  const [editAssignedRepId, setEditAssignedRepId] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  useEffect(() => {
    if (lead) {
      setEditContactName(lead.contactName || "");
      setEditCompanyName(lead.companyName || "");
      setEditVertical(lead.businessVertical || "");
      setEditService(lead.serviceType || "");
      setEditLanguage(lead.preferredLanguage || "");
      setEditAssignedRepId(lead.assignedRep?.id || "");
    }
  }, [lead]);

  // Direct reassign mutation for status bar
  const reassignMutation = useMutation({
    mutationFn: async (newRepId: string) => {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedRepId: newRepId || null }),
      });
      if (!res.ok) throw new Error("Failed to reassign lead");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success("Lead assignment updated ✅");
      queryClient.invalidateQueries({ queryKey: ["lead-detail", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads-directory"] });
      onLeadUpdated?.();
    },
    onError: () => toast.error("Failed to reassign lead"),
  });

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    setSavingInfo(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: editContactName.trim() || null,
          companyName: editCompanyName.trim() || null,
          businessVertical: editVertical.trim() || null,
          serviceType: editService.trim() || null,
          preferredLanguage: editLanguage || null,
          ...(canAssign ? { assignedRepId: editAssignedRepId || null } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed to update lead");
      toast.success("Lead details updated ✅");
      setIsEditingInfo(false);
      queryClient.invalidateQueries({ queryKey: ["lead-detail", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads-directory"] });
      onLeadUpdated?.();
    } catch {
      toast.error("Failed to update lead details");
    } finally {
      setSavingInfo(false);
    }
  }

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success("Lead status updated");
      queryClient.invalidateQueries({ queryKey: ["lead-detail", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads-directory"] });
      onLeadUpdated?.();
    },
    onError: () => toast.error("Failed to update status"),
  });

  // Manual call/interaction log submission
  async function handleLogInteraction(e: React.FormEvent) {
    e.preventDefault();
    if (!remark.trim()) {
      toast.error("Please provide a note or remark");
      return;
    }
    setSubmittingLog(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/dispose`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disposition,
          remark,
          durationSeconds: 0,
          callbackDatetime: callbackDatetime || undefined,
          demoDatetime: demoDatetime || undefined,
          decisionMakerName: decisionMakerName || undefined,
          meetingLink: meetingLink || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to record activity");
      toast.success(
        disposition === "Callback"
          ? "Callback follow-up scheduled ✅"
          : disposition === "Demo Scheduled"
          ? "Demo reminder scheduled ✅"
          : "Activity logged to timeline ✅"
      );
      setRemark("");
      setCallbackDatetime("");
      setDemoDatetime("");
      setDecisionMakerName("");
      setMeetingLink("");
      setShowLogNote(false);
      queryClient.invalidateQueries({ queryKey: ["lead-detail", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads-directory"] });
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      onLeadUpdated?.();
    } catch {
      toast.error("Failed to record interaction");
    } finally {
      setSubmittingLog(false);
    }
  }

  if (isLoading || !lead) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">Loading lead dossier...</p>
        </div>
      </div>
    );
  }

  const telLink = buildTelLink(lead.phoneNumber);
  const waLink = buildWALink(lead.phoneNumber, WA_PITCH);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-end backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-5 shrink-0 border-b border-slate-800">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  {lead.businessVertical || "Unspecified Vertical"}
                </span>
                {lead.serviceType && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {lead.serviceType}
                  </span>
                )}
                {lead.preferredLanguage ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-200 border border-indigo-700/60 font-medium flex items-center gap-1.5">
                    <Languages className="w-3 h-3 text-indigo-400" />
                    <span>Customer Lang:</span>
                    <strong>{formatLanguageLabels(lead.preferredLanguage) || lead.preferredLanguage}</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingInfo(true)}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 hover:text-emerald-400 transition flex items-center gap-1"
                  >
                    <Languages className="w-3 h-3" />
                    + Set Customer Lang
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditingInfo(!isEditingInfo)}
                  className="text-xs text-slate-400 hover:text-emerald-400 flex items-center gap-1 ml-1 transition"
                  title="Edit Lead Information"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {isEditingInfo ? "Cancel Edit" : "Edit Info"}
                </button>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white">
                {lead.companyName || "Personal Contact"}
              </h2>
              {lead.contactName ? (
                <p className="text-slate-300 text-sm flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  {lead.contactName}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingInfo(true)}
                  className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add contact person name
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white rounded-lg p-1.5 hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Call & WhatsApp CTA buttons */}
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-800/80">
            <a
              href={telLink}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition shadow-sm"
            >
              <Phone className="w-4 h-4" />
              Call ({lead.phoneNumber})
            </a>
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition shadow-sm"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp Pitch
            </a>
          </div>
        </div>

        {/* Inline Edit Form if isEditingInfo is true */}
        {isEditingInfo && (
          <form
            onSubmit={handleSaveInfo}
            className="bg-emerald-50/90 border-b border-emerald-200 p-4 space-y-3 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                Edit Lead Details (Representative Entry)
              </p>
              <button
                type="button"
                onClick={() => setIsEditingInfo(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-0.5">
                  Contact Person Name
                </label>
                <input
                  type="text"
                  value={editContactName}
                  onChange={(e) => setEditContactName(e.target.value)}
                  placeholder="e.g. Dr. Rakesh Sharma"
                  className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-0.5">
                  Company / Organization Name
                </label>
                <input
                  type="text"
                  value={editCompanyName}
                  onChange={(e) => setEditCompanyName(e.target.value)}
                  placeholder="e.g. Apex Diagnostic Center"
                  className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-0.5">
                  Industry Vertical
                </label>
                <input
                  type="text"
                  value={editVertical}
                  onChange={(e) => setEditVertical(e.target.value)}
                  placeholder="e.g. Pathlab, Real Estate, Gym"
                  className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-0.5">
                  Service Interest
                </label>
                <select
                  value={editService}
                  onChange={(e) => setEditService(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 cursor-pointer"
                >
                  <option value="">Select Service Interest...</option>
                  {SERVICE_INTERESTS.map((svc) => (
                    <option key={svc} value={svc}>
                      {svc}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-0.5">
                  Customer Preferred Language
                </label>
                <select
                  value={editLanguage}
                  onChange={(e) => setEditLanguage(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 cursor-pointer"
                >
                  <option value="">Unspecified (Any Representative)</option>
                  {LEAD_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              {canAssign && (
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-xs font-medium text-slate-700 block">
                      Assigned Representative
                    </label>
                    {editLanguage && (
                      <span className="text-[10px] text-emerald-700 font-semibold">
                        Matching reps with {getLanguageMeta(editLanguage)?.label || editLanguage} marked
                      </span>
                    )}
                  </div>
                  <select
                    value={editAssignedRepId}
                    onChange={(e) => setEditAssignedRepId(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900"
                  >
                    <option value="">Unassigned Pool</option>
                    {teamReps.map((rep: { id: string; fullName: string; language?: string }) => {
                      const repLanguagesLabel = formatLanguageLabels(rep.language);
                      const isMatch = hasLanguageMatch(rep.language, editLanguage);
                      return (
                        <option key={rep.id} value={rep.id}>
                          {rep.fullName} {repLanguagesLabel ? `(${repLanguagesLabel})` : ""} {isMatch ? "⭐ [Language Match]" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditingInfo(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingInfo}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                {savingInfo ? "Saving..." : "Save Details"}
              </button>
            </div>
          </form>
        )}

        {/* Status Bar & Assigned Info */}
        <div className="bg-slate-50 border-b border-gray-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">Status:</span>
            <select
              value={lead.status}
              onChange={(e) => updateStatusMutation.mutate(e.target.value)}
              className="px-2.5 py-1 rounded-lg font-semibold bg-white border border-gray-300 text-gray-800 focus:ring-2 focus:ring-blue-500 cursor-pointer text-xs"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 text-gray-500 flex-wrap">
            {canAssign ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400 font-medium">Assignee:</span>
                  <select
                    value={lead.assignedRep?.id || ""}
                    onChange={(e) => reassignMutation.mutate(e.target.value)}
                    disabled={reassignMutation.isPending}
                    className="px-2.5 py-1 rounded-lg font-semibold bg-white border border-gray-300 text-gray-800 text-xs focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="">Unassigned</option>
                    {teamReps.map((rep: { id: string; fullName: string; language?: string }) => {
                      const repLangMeta = getLanguageMeta(rep.language);
                      return (
                        <option key={rep.id} value={rep.id}>
                          {rep.fullName} {repLangMeta ? `(${repLangMeta.flag} ${repLangMeta.label})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
                {lead.firstAssignedRep && (
                  <div
                    className="flex items-center gap-1.5 bg-blue-50 text-blue-900 border border-blue-200/90 px-2.5 py-1 rounded-lg text-xs"
                    title="Original first assignee (Visible to Level 2 Managers & Level 3 Admins only)"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="text-gray-500 font-normal">First Assigned:</span>
                    <span className="font-bold text-blue-900">{lead.firstAssignedRep.fullName}</span>
                    {lead.firstAssignedAt && (
                      <span className="text-[10px] text-blue-600/80 font-medium">
                        ({formatDateTime(lead.firstAssignedAt)})
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <span className="text-gray-400">Assigned: </span>
                <span className="font-semibold text-gray-700">
                  {lead.assignedRep?.fullName || "Unassigned"}
                </span>
              </div>
            )}
            <div>
              <span className="text-gray-400">RNR Attempts: </span>
              <span className="font-semibold text-gray-700">{lead.rnrCount}</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 px-6 bg-white gap-6">
          <button
            onClick={() => setActiveTab("timeline")}
            className={cn(
              "py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2",
              activeTab === "timeline"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            )}
          >
            <Clock className="w-4 h-4" />
            {canAssign ? "Call Logs & Timeline" : "My Logged History"} ({lead.callLogs.length})
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2",
              activeTab === "tasks"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            )}
          >
            <Calendar className="w-4 h-4" />
            Follow-Ups & Demos ({lead.tasks.length})
          </button>
          <button
            onClick={() => setActiveTab("deals")}
            className={cn(
              "py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2",
              activeTab === "deals"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            )}
          >
            <DollarSign className="w-4 h-4" />
            Deals ({lead.deals.length})
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: Interaction Timeline */}
          {activeTab === "timeline" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                    {canAssign ? "Call Logs & Interaction History" : "My Logged Activity History"}
                  </h3>
                  {!canAssign && (
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Displaying only interactions logged by your account.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowLogNote(!showLogNote)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showLogNote ? "Cancel Note" : "Log Activity Note"}
                </button>
              </div>

              {/* Level 2 & 3 Exclusive: First Assigned Origin Banner */}
              {canAssign && (
                <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-emerald-50/60 border border-blue-200 rounded-xl p-3.5 flex items-center justify-between text-xs shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                      <UserCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-950 uppercase tracking-wider text-[11px]">
                          First Assigned Origin
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100/90 text-blue-700 font-semibold border border-blue-200">
                          Level 2 & 3 Only
                        </span>
                      </div>
                      <p className="text-slate-700 mt-0.5">
                        Initially assigned to:{" "}
                        <strong className="text-blue-900 font-bold">
                          {lead.firstAssignedRep?.fullName || "Unassigned initially"}
                        </strong>
                      </p>
                    </div>
                  </div>
                  {lead.firstAssignedAt && (
                    <div className="text-right text-[11px] text-slate-500">
                      <span className="block text-[10px] text-slate-400">Assigned On</span>
                      <span className="font-semibold text-slate-700">{formatDateTime(lead.firstAssignedAt)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Inline Quick Log Form */}
              {showLogNote && (
                <form
                  onSubmit={handleLogInteraction}
                  className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-150"
                >
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-gray-700">Disposition:</label>
                    <select
                      value={disposition}
                      onChange={(e) => setDisposition(e.target.value)}
                      className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg bg-white font-medium"
                    >
                      <option value="Connected">Connected</option>
                      <option value="Callback">Callback Requested</option>
                      <option value="Demo Scheduled">Demo Scheduled</option>
                      <option value="Demo Done">Demo Done</option>
                      <option value="RNR">RNR (Ringing No Response)</option>
                      <option value="Not Interested">Not Interested</option>
                      <option value="Already Using">Already Using</option>
                    </select>
                  </div>

                  {/* Callback Follow-Up Section */}
                  {disposition === "Callback" && (
                    <div className="bg-white/90 border border-indigo-200/80 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-indigo-900 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-600" />
                          Follow-Up Date & Time
                        </label>
                        <span className="text-[11px] text-slate-500 font-normal">
                          (Optional if client hasn&apos;t confirmed)
                        </span>
                      </div>
                      <input
                        type="datetime-local"
                        value={callbackDatetime}
                        onChange={(e) => setCallbackDatetime(e.target.value)}
                        className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                      />
                      <p className="text-[11px] text-gray-500">
                        💡 If left blank, this callback will still appear in your Follow-Up agenda and reminders so you won&apos;t miss it.
                      </p>
                    </div>
                  )}

                  {/* Demo Follow-Up Section */}
                  {disposition === "Demo Scheduled" && (
                    <div className="bg-white/90 border border-purple-200/80 rounded-xl p-3.5 space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-purple-900 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-purple-600" />
                            Demo Date & Time
                          </label>
                          <span className="text-[11px] text-slate-500 font-normal">
                            (Optional if client hasn&apos;t confirmed)
                          </span>
                        </div>
                        <input
                          type="datetime-local"
                          value={demoDatetime}
                          onChange={(e) => setDemoDatetime(e.target.value)}
                          className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                          💡 If left blank, this demo reminder will still appear in your Follow-Up agenda so you won&apos;t miss it.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-xs font-medium text-slate-700 block mb-1">
                            Decision Maker Name (Optional)
                          </label>
                          <input
                            type="text"
                            value={decisionMakerName}
                            onChange={(e) => setDecisionMakerName(e.target.value)}
                            placeholder="e.g. Rajesh Kumar"
                            className="w-full text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-700 block mb-1">
                            Meeting Link (Optional)
                          </label>
                          <input
                            type="url"
                            value={meetingLink}
                            onChange={(e) => setMeetingLink(e.target.value)}
                            placeholder="https://meet.google.com/..."
                            className="w-full text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Discussion Notes / Remark <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={remark}
                      onChange={(e) => setRemark(e.target.value)}
                      placeholder="Enter discussion notes, objection details, pricing discussed..."
                      rows={2}
                      className="w-full text-xs p-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none resize-none text-gray-900"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowLogNote(false)}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingLog}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                    >
                      {submittingLog ? "Saving..." : "Save to Timeline"}
                    </button>
                  </div>
                </form>
              )}

              {lead.callLogs.length === 0 ? (
                <div className="space-y-4">
                  <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <Phone className="w-8 h-8 mx-auto mb-2 opacity-40 text-gray-400" />
                    <p className="text-sm font-medium">
                      {canAssign
                        ? "No calls or activities logged yet"
                        : "You have not logged any calls or activities for this lead yet"}
                    </p>
                    <p className="text-xs mt-0.5">Use the dialer or &quot;Log Activity Note&quot; above</p>
                  </div>
                  {canAssign && (
                    <div className="relative border-l-2 border-blue-200 ml-3 space-y-5 py-2">
                      <div className="relative pl-6">
                        <div className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-blue-600 border-2 border-white ring-2 ring-blue-100" />
                        <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                              <UserCheck className="w-3 h-3 text-blue-600" />
                              Initial Lead Assignment
                            </span>
                            {lead.firstAssignedAt && (
                              <span className="text-xs text-blue-600 font-medium">
                                {formatDateTime(lead.firstAssignedAt)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-700">
                            Lead entered CRM from <strong>{lead.source}</strong> and was first assigned to{" "}
                            <strong className="text-blue-900">{lead.firstAssignedRep?.fullName || "Unassigned"}</strong>.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative border-l-2 border-gray-200 ml-3 space-y-5 py-2">
                  {lead.callLogs.map((log: any) => (
                    <div key={log.id} className="relative pl-6">
                      {/* Timeline dot */}
                      <div className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-emerald-600 border-2 border-white ring-2 ring-emerald-100" />
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-800">
                            {log.disposition}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDateTime(log.callTimestamp)}
                          </span>
                        </div>
                        {log.remark ? (
                          <p className="text-xs text-gray-700 bg-white p-2.5 rounded-lg border border-gray-100">
                            {log.remark}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-400 italic">No remark entered</p>
                        )}
                        <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
                          <span>Logged by: {log.rep?.fullName || "System"}</span>
                          {log.durationSeconds > 0 && (
                            <span>Talk time: {log.durationSeconds}s</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Initial Assignment Milestone (Level 2 & 3 only) */}
                  {canAssign && (
                    <div className="relative pl-6">
                      <div className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-blue-600 border-2 border-white ring-2 ring-blue-100" />
                      <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                            <UserCheck className="w-3 h-3 text-blue-600" />
                            Initial Lead Assignment
                          </span>
                          {lead.firstAssignedAt && (
                            <span className="text-xs text-blue-600 font-medium">
                              {formatDateTime(lead.firstAssignedAt)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700">
                          Lead entered CRM from <strong>{lead.source}</strong> and was first assigned to{" "}
                          <strong className="text-blue-900">{lead.firstAssignedRep?.fullName || "Unassigned"}</strong>.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Follow-Ups & Tasks */}
          {activeTab === "tasks" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                Scheduled Follow-Ups & Demos
              </h3>
              {lead.tasks.length === 0 ? (
                <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40 text-gray-400" />
                  <p className="text-sm font-medium">No scheduled tasks or demos</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lead.tasks.map((task: any) => (
                    <div
                      key={task.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {task.taskType === "product_demo" ? (
                            <Video className="w-4 h-4 text-purple-600" />
                          ) : (
                            <Clock className="w-4 h-4 text-blue-600" />
                          )}
                          <span className="text-xs font-bold text-gray-800 capitalize">
                            {task.taskType.replace("_", " ")}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-semibold",
                            task.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          )}
                        >
                          {task.status}
                        </span>
                      </div>
                      {task.scheduledTime ? (
                        <p className="text-xs text-gray-600">
                          Scheduled for: <strong className="text-gray-800">{formatDateTime(task.scheduledTime)}</strong>
                        </p>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="font-medium">Date & time: TBD (Client yet to confirm — follow-up required)</span>
                        </div>
                      )}
                      {task.notes && (
                        <p className="text-xs bg-gray-50 p-2 rounded-lg text-gray-700">{task.notes}</p>
                      )}
                      {task.meetingLink && (
                        <a
                          href={task.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline block"
                        >
                          🔗 Join Demo Meeting
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Commercial Deals */}
          {activeTab === "deals" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                Commercial Deals & Pipeline
              </h3>
              {lead.deals.length === 0 ? (
                <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-40 text-gray-400" />
                  <p className="text-sm font-medium">No commercial deals linked to this lead</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lead.deals.map((deal: any) => (
                    <div
                      key={deal.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-800">{deal.serviceType}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold uppercase">
                          {deal.stage.replace("_", " ")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <p className="text-xs text-gray-400">Quoted Value</p>
                          <p className="text-base font-bold text-green-700">
                            {formatCurrency(Number(deal.quotedPrice))}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Credits</p>
                          <p className="text-sm font-semibold text-gray-700">
                            {deal.quantity.toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>
                      {deal.closingNotes && (
                        <p className="text-xs bg-gray-50 p-2 rounded-lg text-gray-600">
                          {deal.closingNotes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
