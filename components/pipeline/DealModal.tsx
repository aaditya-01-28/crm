"use client";

import { useState, useEffect, useRef } from "react";
import { X, Search, Check, Building2, User, Phone, MapPin, Tag, Plus, UserPlus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { MultiServiceSelect } from "@/components/common/MultiServiceSelect";
import { parseServices } from "@/lib/utils";

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
    businessVertical?: string | null;
    customMetadata?: {
      address?: string;
      [key: string]: any;
    } | null;
  };
}

interface LeadOption {
  id: string;
  companyName: string | null;
  contactName: string | null;
  phoneNumber: string;
  businessVertical: string | null;
  serviceType: string | null;
  customMetadata?: {
    address?: string;
    [key: string]: any;
  } | null;
}

const STAGES = [
  { value: "demo_scheduled", label: "Demo Scheduled" },
  { value: "demo_done", label: "Demo Done" },
  { value: "quote_sent", label: "Quote Sent" },
  { value: "payment_pending", label: "Payment Pending" },
  { value: "closed_won", label: "Closed Won 🏆" },
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

  // Lead Link & Customer Details State
  const [leadId, setLeadId] = useState(deal?.leadId || "");
  const [phoneNumber, setPhoneNumber] = useState(deal?.lead?.phoneNumber || "");
  const [contactName, setContactName] = useState(deal?.lead?.contactName || "");
  const [companyName, setCompanyName] = useState(deal?.lead?.companyName || "");
  const [address, setAddress] = useState(
    deal?.lead?.customMetadata?.address || deal?.lead?.businessVertical || ""
  );

  // Multi-service State
  const [selectedServices, setSelectedServices] = useState<string[]>(
    deal?.serviceType ? parseServices(deal.serviceType) : ["WhatsApp API"]
  );

  // Deal Specifics State
  const [quantity, setQuantity] = useState(deal?.quantity?.toString() || "");
  const [quotedPrice, setQuotedPrice] = useState(deal?.quotedPrice?.toString() || "");
  const [closingDate, setClosingDate] = useState(
    deal?.expectedClosingDate ? deal.expectedClosingDate.split("T")[0] : ""
  );
  const [stage, setStage] = useState(deal?.stage || "quote_sent");
  const [notes, setNotes] = useState(deal?.closingNotes || "");
  const [saving, setSaving] = useState(false);

  // Live Autocomplete Search State
  const [leadSearch, setLeadSearch] = useState(
    deal?.lead
      ? `${deal.lead.companyName || deal.lead.contactName || ""} (${deal.lead.phoneNumber})`
      : ""
  );
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [showLeadDrop, setShowLeadDrop] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function handleSearchChange(val: string) {
    setLeadSearch(val);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!val || val.trim().length < 2) {
      setLeadOptions([]);
      setShowLeadDrop(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/leads?search=${encodeURIComponent(val.trim())}&limit=10`);
        if (res.ok) {
          const data = await res.json();
          setLeadOptions(data.leads || []);
          setShowLeadDrop(true);
        }
      } catch (err) {
        console.error("Error searching leads:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);
  }

  function handleSelectLead(lead: LeadOption) {
    setLeadId(lead.id);
    setPhoneNumber(lead.phoneNumber || "");
    setContactName(lead.contactName || "");
    setCompanyName(lead.companyName || "");
    setAddress(lead.customMetadata?.address || lead.businessVertical || "");

    if (lead.serviceType) {
      const services = parseServices(lead.serviceType);
      if (services.length > 0) {
        setSelectedServices(services);
      }
    }

    setLeadSearch(
      `${lead.companyName || lead.contactName || "Lead"} (${lead.phoneNumber})`
    );
    setShowLeadDrop(false);
    toast.success("Lead details auto-filled ✅");
  }

  function handleClearLead() {
    setLeadId("");
    setLeadSearch("");
    setPhoneNumber("");
    setContactName("");
    setCompanyName("");
    setAddress("");
    setSelectedServices(["WhatsApp API"]);
    setShowLeadDrop(false);
  }

  function handleCreateAsNewCustomer() {
    // If user typed something in search, prefill phone if it has digits, else prefill name/company
    const query = leadSearch.trim();
    const digitsOnly = query.replace(/\D/g, "");
    if (digitsOnly.length >= 7) {
      setPhoneNumber(digitsOnly);
    } else if (query) {
      setCompanyName(query);
    }
    setLeadId("");
    setShowLeadDrop(false);
  }

  async function handleSave() {
    if (!leadId && !phoneNumber.trim()) {
      toast.error("Please enter a phone number or select an existing lead");
      return;
    }

    if (selectedServices.length === 0) {
      toast.error("Please select at least one interested service");
      return;
    }

    if (!quantity || !quotedPrice) {
      toast.error("Please fill Quantity and Quoted Price");
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
          leadId: leadId || undefined,
          phoneNumber: phoneNumber.trim(),
          contactName: contactName.trim() || null,
          companyName: companyName.trim() || null,
          address: address.trim() || null,
          serviceType: selectedServices.join(", "),
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

      toast.success(isEdit ? "Deal updated ✅" : "Deal created successfully ✅");
      onSaved();
    } catch {
      toast.error("Network error saving deal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-2xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-gray-100 flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-xs z-20">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">
              {isEdit ? "Edit Deal Pipeline" : "Create New Deal"}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Auto-fill from existing leads or add new customer details directly.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Section 1: Customer Identification & Auto-Fill */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Customer & Lead Search
                </h4>
              </div>
              {leadId ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Existing Lead Linked
                  </span>
                  <button
                    type="button"
                    onClick={handleClearLead}
                    className="text-[11px] text-rose-600 hover:underline font-medium"
                  >
                    Unlink
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  New Customer Entry
                </span>
              )}
            </div>

            {/* Live Autocomplete Search Input */}
            <div className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={leadSearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => {
                    if (leadOptions.length > 0) setShowLeadDrop(true);
                  }}
                  placeholder="Type name, company, or phone number to auto-fill..."
                  className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs font-medium"
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                {isSearching ? (
                  <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin absolute right-3 top-3" />
                ) : leadSearch ? (
                  <button
                    type="button"
                    onClick={handleClearLead}
                    className="text-gray-400 hover:text-gray-600 absolute right-3 top-3"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : null}
              </div>

              {/* Suggestions Dropdown */}
              {showLeadDrop && (
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-30 mt-1 max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {leadOptions.length > 0 ? (
                    <>
                      <div className="px-3 py-1.5 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        Matching Leads ({leadOptions.length}) - Click to auto-fill
                      </div>
                      {leadOptions.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => handleSelectLead(l)}
                          className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50/70 transition flex items-center justify-between group"
                        >
                          <div>
                            <p className="font-semibold text-sm text-gray-900 group-hover:text-emerald-700">
                              {l.companyName || l.contactName || "Unnamed Lead"}
                            </p>
                            <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-emerald-700 font-medium">
                                📞 {l.phoneNumber}
                              </span>
                              {l.contactName && l.companyName && (
                                <span className="text-gray-400">• {l.contactName}</span>
                              )}
                              {l.businessVertical && (
                                <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[10px]">
                                  {l.businessVertical}
                                </span>
                              )}
                            </p>
                            {l.serviceType && (
                              <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-sm">
                                Interested in: <span className="text-gray-600">{l.serviceType}</span>
                              </p>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-emerald-600 opacity-0 group-hover:opacity-100 transition shrink-0 ml-2">
                            Select ↵
                          </span>
                        </button>
                      ))}
                    </>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-xs text-gray-500">No leads found matching &ldquo;{leadSearch}&rdquo;</p>
                    </div>
                  )}

                  {/* Option to create as new */}
                  <div className="p-2 bg-gray-50">
                    <button
                      type="button"
                      onClick={handleCreateAsNewCustomer}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100/60 rounded-lg flex items-center gap-1.5 transition"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Add &ldquo;{leadSearch}&rdquo; as a brand new customer details
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Editable Customer Details Fields (Auto-filled or User Entered) */}
            <div className="pt-2 border-t border-slate-200">
              <p className="text-[11px] font-semibold text-slate-600 mb-2.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Customer Dossier Details {leadId && "(Editable for this deal)"}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Phone Number */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="e.g. 9876543210"
                      required
                      className="w-full pl-8 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900"
                    />
                    <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>

                {/* Contact Name */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">
                    Contact Person Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="e.g. Dr. Rajesh Sharma"
                      className="w-full pl-8 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 font-medium"
                    />
                    <User className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>

                {/* Company Name */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">
                    Company / Organization
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Apex Health Diagnostic"
                      className="w-full pl-8 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 font-medium"
                    />
                    <Building2 className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">
                    Address / Location / City
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. Indiranagar, Bangalore"
                      className="w-full pl-8 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900"
                    />
                    <MapPin className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Multi-Select Service Interests */}
          <div className="bg-emerald-50/40 border border-emerald-200/80 rounded-xl p-4">
            <MultiServiceSelect
              selectedServices={selectedServices}
              onChange={setSelectedServices}
              label="Interested Services (Multiple selection & add/remove)"
              required
              placeholder="+ Add service interest (WhatsApp, SMS, RCS...)"
            />
          </div>

          {/* Section 3: Deal Commercials & Timeline */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-emerald-600" />
              Deal Commercials & Pipeline Stage
            </h4>

            {/* Quantity + Quoted Price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">
                  Credits / Units / Qty <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 50000"
                  required
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">
                  Quoted Price (₹ INR) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={quotedPrice}
                  onChange={(e) => setQuotedPrice(e.target.value)}
                  placeholder="e.g. 25000"
                  required
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>

            {/* Stage + Expected Closing Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">
                  Pipeline Stage
                </label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-medium"
                >
                  {STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">
                  Expected Close Date
                </label>
                <input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>
            </div>

            {/* Closing / Negotiation Notes */}
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">
                Negotiation Notes & Next Steps
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Mention customer requirements, pricing concession discussed, decision timeline..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/80 sticky bottom-0 z-20">
          <p className="text-[11px] text-gray-500">
            {leadId ? (
              <span className="text-emerald-700 font-medium">Linked to existing lead ID: {leadId.slice(0, 8)}...</span>
            ) : (
              <span>A new lead record will automatically be created.</span>
            )}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-white font-medium transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-xs transition disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving Deal...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isEdit ? "Update Deal" : "Save & Create Deal"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
