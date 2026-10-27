"use client";

import { useState, useEffect, useRef } from "react";
import {
  Phone,
  MessageCircle,
  Building2,
  User,
  Tag,
  Hash,
  Edit3,
  Check,
  X,
  Languages,
  Smartphone,
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  FileText,
} from "lucide-react";
import {
  buildTelLink,
  buildWALink,
  WA_PITCH,
  cn,
  formatDuration,
  formatLanguageLabels,
  LEAD_LANGUAGES,
  parseServices,
} from "@/lib/utils";
import { MultiServiceSelect } from "@/components/common/MultiServiceSelect";
import { DispositionBar } from "./DispositionBar";
import { WhatsAppTemplateModal } from "./WhatsAppTemplateModal";
import { toast } from "sonner";

interface Lead {
  id: string;
  phoneNumber: string;
  contactName: string | null;
  companyName: string | null;
  businessVertical: string | null;
  serviceType: string | null;
  preferredLanguage?: string | null;
  source: string;
  status: string;
  rnrCount: number;
}

interface DialerCardProps {
  lead: Lead;
  onDisposed: (nextLead: Lead | null) => void;
  onCallLogged?: () => void;
}

export function DialerCard({ lead: initialLead, onDisposed, onCallLogged }: DialerCardProps) {
  const [lead, setLead] = useState<Lead>(initialLead);
  const [callStarted, setCallStarted] = useState(false);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [isDisposing, setIsDisposing] = useState(false);

  // Push-to-dial status
  const [pushStatus, setPushStatus] = useState<
    "idle" | "dispatching" | "ringing" | "in_call" | "failed"
  >("idle");
  const [pushJobId, setPushJobId] = useState<string | null>(null);

  // In-call UI controls
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);

  // Quick note
  const [quickNote, setQuickNote] = useState("");

  // WhatsApp template modal
  const [showWAModal, setShowWAModal] = useState(false);

  // Edit Lead state
  const [isEditingLead, setIsEditingLead] = useState(false);
  const [editContactName, setEditContactName] = useState(lead.contactName || "");
  const [editCompanyName, setEditCompanyName] = useState(lead.companyName || "");
  const [editVertical, setEditVertical] = useState(lead.businessVertical || "");
  const [editServices, setEditServices] = useState<string[]>(
    lead.serviceType ? parseServices(lead.serviceType) : []
  );
  const [editLanguage, setEditLanguage] = useState(lead.preferredLanguage || "");
  const [isSavingLead, setIsSavingLead] = useState(false);

  // Reset when queue moves to next lead
  if (lead.id !== initialLead.id) {
    setLead(initialLead);
    setEditContactName(initialLead.contactName || "");
    setEditCompanyName(initialLead.companyName || "");
    setEditVertical(initialLead.businessVertical || "");
    setEditServices(initialLead.serviceType ? parseServices(initialLead.serviceType) : []);
    setEditLanguage(initialLead.preferredLanguage || "");
    setIsEditingLead(false);
    setCallStarted(false);
    setCallStartTime(null);
    setCallDurationSeconds(0);
    setPushStatus("idle");
    setPushJobId(null);
    setQuickNote("");
  }

  // Active call duration timer
  useEffect(() => {
    let interval: any = null;
    if (callStarted && callStartTime) {
      interval = setInterval(() => {
        setCallDurationSeconds(Math.round((Date.now() - callStartTime.getTime()) / 1000));
      }, 1000);
    } else {
      setCallDurationSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callStarted, callStartTime]);

  // Push-to-dial status poller
  useEffect(() => {
    if (!pushJobId || pushStatus === "idle" || pushStatus === "in_call") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/telephony/push-to-dial?jobId=${pushJobId}`);
        if (!res.ok) return;
        const data = await res.json();
        const job = data.job;
        if (!job) return;

        if (job.status === "ringing") {
          setPushStatus("ringing");
        } else if (job.status === "in_call") {
          setPushStatus("in_call");
          setCallStarted(true);
          if (!callStartTime) setCallStartTime(new Date());
          toast.success("📱 Phone Companion Connected! Call is now live on SIM.");
        } else if (job.status === "completed" || job.status === "cancelled") {
          clearInterval(interval);
        }
      } catch (_) {}
    }, 1500);

    return () => clearInterval(interval);
  }, [pushJobId, pushStatus, callStartTime]);

  const telLink = buildTelLink(lead.phoneNumber);

  // Option B: Trigger call via Android phone companion
  async function handlePushToDial() {
    setPushStatus("dispatching");
    setCallStarted(true);
    setCallStartTime(new Date());

    try {
      const res = await fetch("/api/telephony/push-to-dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          phoneNumber: lead.phoneNumber,
          contactName: lead.contactName,
          companyName: lead.companyName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to dispatch push-to-dial signal");
        setPushStatus("idle");
        return;
      }

      setPushJobId(data.job.id);
      setPushStatus("ringing");
      toast.success("⚡ Signal dispatched! Check your phone companion.");
    } catch (_) {
      toast.error("Network error dispatching push-to-dial");
      setPushStatus("idle");
    }
  }

  // Fallback: Direct browser/softphone call
  function handleDirectCall() {
    setCallStarted(true);
    setCallStartTime(new Date());
    setPushStatus("in_call");
  }

  // End active call and focus on disposition
  function handleEndActiveCall() {
    setCallStarted(false);
    setPushStatus("idle");
    if (pushJobId) {
      fetch("/api/telephony/push-to-dial", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: pushJobId, status: "completed" }),
      }).catch(() => {});
    }
    toast.info("Call ended. Select disposition below to save outcome.");
  }

  // Save edited lead details
  async function handleSaveLeadDetails(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingLead(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: editContactName.trim() || null,
          companyName: editCompanyName.trim() || null,
          businessVertical: editVertical.trim() || null,
          serviceType: editServices.join(", ") || null,
          preferredLanguage: editLanguage || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update lead details");
        return;
      }
      setLead((prev) => ({
        ...prev,
        contactName: editContactName.trim() || null,
        companyName: editCompanyName.trim() || null,
        businessVertical: editVertical.trim() || null,
        serviceType: editServices.join(", ") || null,
        preferredLanguage: editLanguage || null,
      }));
      setIsEditingLead(false);
      toast.success("Lead details updated ✅");
    } catch {
      toast.error("Network error saving lead");
    } finally {
      setIsSavingLead(false);
    }
  }

  // Log disposition and auto-advance
  async function handleDispose(
    disposition: string,
    extra?: {
      remark?: string;
      callbackDatetime?: string;
      demoDatetime?: string;
      decisionMakerName?: string;
      meetingLink?: string;
    }
  ) {
    setIsDisposing(true);
    const durationSeconds = callDurationSeconds > 0
      ? callDurationSeconds
      : callStartTime
      ? Math.round((Date.now() - callStartTime.getTime()) / 1000)
      : 0;

    const mergedRemark = [quickNote.trim(), extra?.remark?.trim()]
      .filter(Boolean)
      .join(" • ") || undefined;

    try {
      const res = await fetch(`/api/leads/${lead.id}/dispose`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disposition,
          durationSeconds,
          ...extra,
          remark: mergedRemark,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to log disposition");
        return;
      }
      toast.success(`✅ ${disposition} logged`);
      setCallStarted(false);
      setCallStartTime(null);
      setCallDurationSeconds(0);
      setPushStatus("idle");
      setPushJobId(null);
      setQuickNote("");
      setIsEditingLead(false);
      onCallLogged?.();
      onDisposed(data.nextLead);
    } catch {
      toast.error("Network error");
    } finally {
      setIsDisposing(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
      {/* Card Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-emerald-950 px-6 py-5 border-b border-emerald-500/20">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span
                className={cn(
                  "text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                )}
              >
                {lead.status.replace("_", " ").toUpperCase()}
              </span>
              {lead.businessVertical && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {lead.businessVertical}
                </span>
              )}
              {lead.serviceType && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {lead.serviceType}
                </span>
              )}
              {lead.preferredLanguage && (
                <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                  <Languages className="w-3 h-3 text-indigo-400" />
                  {formatLanguageLabels(lead.preferredLanguage) || lead.preferredLanguage}
                </span>
              )}
              {lead.rnrCount > 0 && (
                <span className="text-xs bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full font-bold">
                  RNR ×{lead.rnrCount}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {lead.companyName || "Unnamed Prospect"}
              </h2>
              <button
                type="button"
                onClick={() => setIsEditingLead(!isEditingLead)}
                title="Edit lead contact or company name"
                className="text-emerald-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {lead.contactName ? (
                <p className="text-slate-300 text-sm flex items-center gap-1 font-medium">
                  <User className="w-3.5 h-3.5 text-emerald-400" />
                  {lead.contactName}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingLead(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium underline flex items-center gap-1 cursor-pointer"
                >
                  <User className="w-3 h-3" />
                  + Add Contact Name
                </button>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-slate-400 text-xs">Origin Source</p>
            <p className="text-emerald-300 text-sm font-semibold">{lead.source}</p>
          </div>
        </div>
      </div>

      {/* Inline Quick Edit Form */}
      {isEditingLead && (
        <form
          onSubmit={handleSaveLeadDetails}
          className="bg-emerald-50/70 border-b border-emerald-200 p-4 space-y-3 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
              Edit Lead Details (Representative Entry)
            </p>
            <button
              type="button"
              onClick={() => setIsEditingLead(false)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
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
                className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
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
                className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
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
                className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-0.5">
                Customer Preferred Language
              </label>
              <select
                value={editLanguage}
                onChange={(e) => setEditLanguage(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="">Unspecified (Any Rep)</option>
                {LEAD_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <MultiServiceSelect
                selectedServices={editServices}
                onChange={setEditServices}
                label="Interested Services (Multiple selection)"
                placeholder="+ Add service interest..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsEditingLead(false)}
              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingLead}
              className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {isSavingLead ? "Saving..." : "Save Details"}
            </button>
          </div>
        </form>
      )}

      {/* Card Body */}
      <div className="px-6 py-5 space-y-5">
        {/* Info Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50/75 p-3.5 rounded-xl border border-gray-100">
          <InfoItem icon={Phone} label="Phone Number" value={lead.phoneNumber} />
          <InfoItem icon={Building2} label="Vertical" value={lead.businessVertical || "General"} />
          <InfoItem icon={Tag} label="Service" value={lead.serviceType || "WhatsApp API"} />
          <InfoItem icon={Hash} label="Outbound Attempts" value={`${lead.rnrCount} RNR`} />
        </div>

        {/* ACTIVE CALL HUD (When call is active or ringing) */}
        {callStarted && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 via-slate-850 to-emerald-950 text-white border border-emerald-500/30 shadow-md animate-in fade-in duration-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Waveform indicator */}
                <div className="flex items-end gap-1 h-6">
                  <span className="w-1 bg-emerald-400 rounded-full animate-pulse h-4" />
                  <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-6" />
                  <span className="w-1 bg-emerald-400 rounded-full animate-pulse h-3" />
                  <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-5" />
                  <span className="w-1 bg-emerald-400 rounded-full animate-pulse h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                      {pushStatus === "dispatching"
                        ? "Signal Dispatched"
                        : pushStatus === "ringing"
                        ? "Phone Companion Ringing"
                        : "Live SIM Telephony"}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" /> REC
                    </span>
                  </div>
                  <p className="text-sm font-mono mt-0.5">
                    Connected to <strong className="text-white">{lead.phoneNumber}</strong>
                  </p>
                </div>
              </div>

              {/* Call Duration */}
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-mono block">
                  Duration
                </span>
                <span className="font-mono text-2xl font-black text-emerald-400">
                  {formatDuration(callDurationSeconds)}
                </span>
              </div>
            </div>

            {/* In-Call Telephony Controls */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer",
                    isMuted
                      ? "bg-rose-500 text-white"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                  )}
                >
                  {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  <span>{isMuted ? "Muted" : "Mute"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsOnHold(!isOnHold)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer",
                    isOnHold
                      ? "bg-amber-500 text-white"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                  )}
                >
                  {isOnHold ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  <span>{isOnHold ? "Unhold" : "Hold"}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleEndActiveCall}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>End Call & Log Outcome</span>
              </button>
            </div>
          </div>
        )}

        {/* Primary Call & WhatsApp Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Option B: Push-to-Dial Phone Companion */}
          <button
            type="button"
            onClick={handlePushToDial}
            disabled={callStarted}
            className="flex items-center justify-center gap-2 bg-[#00c853] hover:bg-[#00b248] text-white font-bold py-3.5 px-4 rounded-xl transition text-xs shadow-sm cursor-pointer disabled:opacity-50"
            title="Pushes dial command to your paired Android smartphone"
          >
            <Smartphone className="w-4 h-4" />
            <span>
              {pushStatus === "dispatching"
                ? "Signaling Phone..."
                : pushStatus === "ringing"
                ? "Phone Dialing..."
                : "Push-to-Dial Phone"}
            </span>
          </button>

          {/* Direct Softphone / tel: Fallback */}
          <a
            href={telLink}
            onClick={handleDirectCall}
            className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold py-3.5 px-4 rounded-xl transition text-xs shadow-sm"
            title="Dial using computer default telephony app (tel: protocol)"
          >
            <Phone className="w-4 h-4 text-emerald-400" />
            <span>Direct Call (tel:)</span>
          </a>

          {/* Quick WhatsApp Template Modal */}
          <button
            type="button"
            onClick={() => setShowWAModal(true)}
            className="flex items-center justify-center gap-2 bg-[#00b87c] hover:bg-[#00a36c] text-white font-bold py-3.5 px-4 rounded-xl transition text-xs shadow-sm cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Quick WhatsApp</span>
          </button>
        </div>

        {/* Quick Call Note / Observation Input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Call Observation / Quick Note
            </label>
            <span className="text-[11px] text-gray-400">Auto-attached to disposition</span>
          </div>
          <div className="relative">
            <FileText className="w-4 h-4 absolute left-3.5 top-3 text-gray-400" />
            <input
              type="text"
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              placeholder="e.g. 'Interested in 50k WhatsApp API credits, requested demo tomorrow 4 PM'..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
            />
          </div>
        </div>

        {/* Grouped Disposition Bar */}
        <div className="pt-2 border-t border-gray-100">
          <DispositionBar
            onDispose={handleDispose}
            disabled={isDisposing}
            leadId={lead.id}
            quickNote={quickNote}
          />
        </div>
      </div>

      {/* WhatsApp Pre-Approved Templates Modal */}
      {showWAModal && (
        <WhatsAppTemplateModal
          lead={lead}
          onClose={() => setShowWAModal(false)}
        />
      )}
    </div>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
        <Icon className="w-3.5 h-3.5 text-gray-500" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 leading-tight uppercase font-medium">{label}</p>
        <p className="text-xs font-semibold text-gray-800 leading-tight truncate mt-0.5">
          {value}
        </p>
      </div>
    </div>
  );
}
