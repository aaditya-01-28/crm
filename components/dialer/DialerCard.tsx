"use client";

import { useState } from "react";
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
} from "lucide-react";
import {
  buildTelLink,
  buildWALink,
  WA_PITCH,
  cn,
  SERVICE_INTERESTS,
  LEAD_LANGUAGES,
  getLanguageMeta,
  formatLanguageLabels,
  parseServices,
} from "@/lib/utils";
import { MultiServiceSelect } from "@/components/common/MultiServiceSelect";
import { DispositionBar } from "./DispositionBar";
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
}

export function DialerCard({ lead: initialLead, onDisposed }: DialerCardProps) {
  const [lead, setLead] = useState<Lead>(initialLead);
  const [callStarted, setCallStarted] = useState(false);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [isDisposing, setIsDisposing] = useState(false);

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

  // Synchronize when a new lead is passed in queue
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
  }

  const telLink = buildTelLink(lead.phoneNumber);
  const waLink = buildWALink(lead.phoneNumber, WA_PITCH);

  function handleCallClick() {
    setCallStarted(true);
    setCallStartTime(new Date());
  }

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
    const durationSeconds = callStartTime
      ? Math.round((Date.now() - callStartTime.getTime()) / 1000)
      : 0;

    try {
      const res = await fetch(`/api/leads/${lead.id}/dispose`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disposition, durationSeconds, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to log disposition");
        return;
      }
      toast.success(`✅ ${disposition} logged`);
      setCallStarted(false);
      setCallStartTime(null);
      setIsEditingLead(false);
      onDisposed(data.nextLead);
    } catch {
      toast.error("Network error");
    } finally {
      setIsDisposing(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Card Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-emerald-950 px-6 py-5 border-b border-emerald-500/20">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span
                className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
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
                {lead.companyName || "Unnamed Lead"}
              </h2>
              <button
                type="button"
                onClick={() => setIsEditingLead(!isEditingLead)}
                title="Edit lead contact or company name"
                className="text-emerald-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {lead.contactName ? (
                <p className="text-slate-300 text-sm flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-emerald-400" />
                  {lead.contactName}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingLead(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium underline flex items-center gap-1"
                >
                  <User className="w-3 h-3" />
                  + Add Contact Name
                </button>
              )}
            </div>
          </div>

          <div className="text-right">
            <p className="text-slate-400 text-xs">Source</p>
            <p className="text-emerald-300 text-sm font-semibold">{lead.source}</p>
          </div>
        </div>
      </div>

      {/* Inline Quick Edit Form (for representatives to add customer name & company) */}
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

            <div className="sm:col-span-2">
              <MultiServiceSelect
                selectedServices={editServices}
                onChange={setEditServices}
                label="Interested Services (Multiple selection)"
                placeholder="+ Add service interest..."
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
              className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {isSavingLead ? "Saving..." : "Save Details"}
            </button>
          </div>
        </form>
      )}

      {/* Card Body */}
      <div className="px-6 py-5">
        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <InfoItem icon={Phone} label="Phone" value={lead.phoneNumber} />
          <InfoItem
            icon={Building2}
            label="Vertical"
            value={lead.businessVertical || "—"}
          />
          <InfoItem
            icon={Tag}
            label="Service Interest"
            value={lead.serviceType || "—"}
          />
          <InfoItem
            icon={Hash}
            label="Attempts"
            value={`${lead.rnrCount} RNR`}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-6">
          {/* Call Button */}
          <a
            href={telLink}
            onClick={handleCallClick}
            className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl transition text-sm shadow-sm"
          >
            <Phone className="w-5 h-5" />
            {callStarted ? "Calling..." : "Call Now"}
          </a>

          {/* WhatsApp Button */}
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 rounded-xl transition text-sm shadow-sm"
          >
            <MessageCircle className="w-5 h-5" />
            WhatsApp
          </a>
        </div>

        {/* Duration indicator */}
        {callStarted && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Call in progress — log disposition when done
          </div>
        )}

        {/* Disposition Bar */}
        <DispositionBar
          onDispose={handleDispose}
          disabled={isDisposing}
          leadId={lead.id}
        />
      </div>
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
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div>
        <p className="text-xs text-gray-400 leading-tight">{label}</p>
        <p className="text-sm font-medium text-gray-800 leading-tight">
          {value}
        </p>
      </div>
    </div>
  );
}
