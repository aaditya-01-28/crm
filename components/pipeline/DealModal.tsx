"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

interface Deal {
  id: string;
  serviceType: string;
  quantity: number;
  quotedPrice: string;
  expectedClosingDate: string | null;
  closingNotes: string | null;
  leadId: string;
  stage: string;
  lead: {
    companyName: string | null;
    contactName: string | null;
    phoneNumber: string;
  };
}

interface Lead {
  id: string;
  companyName: string | null;
  contactName: string | null;
  phoneNumber: string;
}

const SERVICE_TYPES = [
  "WhatsApp API",
  "Virtual WhatsApp",
  "Bulk SMS",
  "RCS Messaging",
  "Transactional SMS",
  "Promotional SMS",
  "Voice SMS",
  "OTP API",
  "Combo WA+SMS",
  "Reseller",
];

const STAGES = [
  { value: "demo_scheduled", label: "Demo Scheduled" },
  { value: "demo_done", label: "Demo Done" },
  { value: "quote_sent", label: "Quote Sent" },
  { value: "payment_pending", label: "Payment Pending" },
  { value: "closed_won", label: "Closed Won" },
  { value: "closed_lost", label: "Closed Lost" },
];

export function DealModal({
  deal,
  onClose,
  onSaved,
}: {
  deal: Deal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!deal;
  const [leadId, setLeadId] = useState(deal?.leadId || "");
  const [serviceType, setServiceType] = useState(deal?.serviceType || "");
  const [quantity, setQuantity] = useState(deal?.quantity?.toString() || "");
  const [quotedPrice, setQuotedPrice] = useState(deal?.quotedPrice?.toString() || "");
  const [closingDate, setClosingDate] = useState(
    deal?.expectedClosingDate ? deal.expectedClosingDate.split("T")[0] : ""
  );
  const [stage, setStage] = useState(deal?.stage || "demo_scheduled");
  const [notes, setNotes] = useState(deal?.closingNotes || "");
  const [saving, setSaving] = useState(false);

  // Search leads for autocomplete
  const [leadSearch, setLeadSearch] = useState(
    deal?.lead ? `${deal.lead.companyName || ""} ${deal.lead.phoneNumber}` : ""
  );
  const [leadOptions, setLeadOptions] = useState<Lead[]>([]);
  const [showLeadDrop, setShowLeadDrop] = useState(false);

  async function searchLeads(q: string) {
    if (q.length < 2) return;
    const res = await fetch(`/api/leads?limit=10&status=callback`);
    if (res.ok) {
      const data = await res.json();
      setLeadOptions(data.leads || []);
      setShowLeadDrop(true);
    }
  }

  async function handleSave() {
    if (!leadId || !serviceType || !quantity || !quotedPrice) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      const method = isEdit ? "PATCH" : "POST";
      const url = isEdit ? `/api/deals/${deal!.id}` : "/api/deals";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          serviceType,
          quantity: parseInt(quantity),
          quotedPrice: parseFloat(quotedPrice),
          expectedClosingDate: closingDate || null,
          stage,
          closingNotes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save deal");
        return;
      }
      toast.success(isEdit ? "Deal updated ✅" : "Deal created ✅");
      onSaved();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">
            {isEdit ? "Edit Deal" : "Create New Deal"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Lead Search */}
          <div className="relative">
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Lead / Company *
            </label>
            <input
              type="text"
              value={leadSearch}
              onChange={(e) => {
                setLeadSearch(e.target.value);
                searchLeads(e.target.value);
              }}
              placeholder="Search by company or phone..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {showLeadDrop && leadOptions.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 mt-1 max-h-40 overflow-y-auto">
                {leadOptions.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      setLeadId(l.id);
                      setLeadSearch(
                        `${l.companyName || ""} — ${l.phoneNumber}`
                      );
                      setShowLeadDrop(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0"
                  >
                    <span className="font-medium">{l.companyName || "—"}</span>
                    <span className="text-gray-400 ml-2">{l.phoneNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Service Type */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Service Type *
            </label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select service...</option>
              {SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Quantity + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Credits / Qty *
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 10000"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Quoted Price (₹) *
              </label>
              <input
                type="number"
                value={quotedPrice}
                onChange={(e) => setQuotedPrice(e.target.value)}
                placeholder="e.g. 15000"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Stage + Closing Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Stage
              </label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Expected Close Date
              </label>
              <input
                type="date"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional context, negotiations, next steps..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-60 flex items-center gap-2 font-medium"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : null}
              {isEdit ? "Update Deal" : "Create Deal"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
