"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  ArrowLeft,
  Search,
  Check,
  Building2,
  User,
  Phone,
  MapPin,
  Tag,
  Plus,
  UserPlus,
  CheckCircle2,
  Trash2,
  Video,
  FileText,
  DollarSign,
  Trophy,
  AlertOctagon,
  Calendar,
  CreditCard,
  Mail,
  Clock,
  Layers,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { MultiServiceSelect } from "@/components/common/MultiServiceSelect";
import { parseServices, formatCurrency, SERVICE_INTERESTS, calculateGST } from "@/lib/utils";

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

export interface CommercialItem {
  id?: string;
  serviceType: string;
  quantity: string;
  quotedPrice: string;
  stage: string;
  closingDate: string;
  notes: string;

  // Demo Scheduled specific
  demoDate?: string;
  meetingLink?: string;
  decisionMakerName?: string;
  demoNotes?: string;

  // Demo Done & Quote Sent specific
  contactBackDate?: string;
  followupChannel?: string;
  demoFeedback?: string;

  // Payment Pending specific
  paymentMode?: string;
  paymentDueDate?: string;

  // Closed Won specific
  executiveName?: string;
  executiveEmail?: string;
  wonDate?: string;
  userType?: string;
  productName?: string;
  productDescription?: string;
  creditsToAdd?: string;
  userId?: string;
  customerCompanyName?: string;
  customerName?: string;
  customerContactNumber?: string;
  customerEmail?: string;
  originalAmount?: string;
  taxAmount?: string;
  tds?: string;
  finalAmount?: string;
  gstinNumber?: string;
  paymentScreenshotUrl?: string;

  // Closed Lost specific
  lostReason?: string;
  competitorName?: string;
  lostRemarks?: string;
  recontactDate?: string;
}

const STAGES = [
  { value: "demo_scheduled", label: "Demo Scheduled", icon: Video, color: "text-purple-600 bg-purple-50 border-purple-200" },
  { value: "demo_done", label: "Demo Done", icon: CheckCircle2, color: "text-teal-600 bg-teal-50 border-teal-200" },
  { value: "quote_sent", label: "Quote Sent", icon: FileText, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "payment_pending", label: "Payment Pending", icon: DollarSign, color: "text-orange-600 bg-orange-50 border-orange-200" },
  { value: "closed_won", label: "Closed Won 🏆", icon: Trophy, color: "text-emerald-700 bg-emerald-50 border-emerald-300" },
  { value: "closed_lost", label: "Closed Lost", icon: AlertOctagon, color: "text-rose-600 bg-rose-50 border-rose-200" },
];

function getDefaultNextDayFollowup(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(11, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T11:00`;
}

function getDefaultTomorrowDemo(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(15, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T15:00`;
}

export function DealModal({
  deal,
  onClose,
  onSaved,
  canEdit = true,
  canDelete = false,
}: {
  deal: Deal | null;
  onClose: () => void;
  onSaved: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const isEdit = !!deal;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Current session user details
  const [currentUser, setCurrentUser] = useState<{ fullName?: string; email?: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setCurrentUser(data.user);
      })
      .catch(() => {});
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Lead Link & Customer Details State
  const [leadId, setLeadId] = useState(deal?.leadId || "");
  const [phoneNumber, setPhoneNumber] = useState(deal?.lead?.phoneNumber || "");
  const [contactName, setContactName] = useState(deal?.lead?.contactName || "");
  const [companyName, setCompanyName] = useState(deal?.lead?.companyName || "");
  const [address, setAddress] = useState(
    deal?.lead?.customMetadata?.address || deal?.lead?.businessVertical || ""
  );

  // Multi-service State (Top-level customer interested services)
  const [selectedServices, setSelectedServices] = useState<string[]>(
    deal?.serviceType ? parseServices(deal.serviceType) : ["WhatsApp API"]
  );

  // Dynamic Array of Deal Commercials & Pipeline Stages
  const [commercials, setCommercials] = useState<CommercialItem[]>([
    {
      id: deal?.id,
      serviceType:
        deal?.serviceType
          ? parseServices(deal.serviceType)[0] || deal.serviceType
          : "WhatsApp API",
      quantity: deal?.quantity?.toString() || "10000",
      quotedPrice: deal?.quotedPrice?.toString() || "0",
      stage: deal?.stage || "quote_sent",
      closingDate: deal?.expectedClosingDate
        ? deal.expectedClosingDate.split("T")[0]
        : "",
      notes: deal?.closingNotes || "",
      contactBackDate: getDefaultNextDayFollowup(),
      demoDate: getDefaultTomorrowDemo(),
      userType: "new_user",
      paymentMode: "UPI / QR",
      wonDate: new Date().toISOString().split("T")[0],
    },
  ]);

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
        const res = await fetch(
          `/api/leads?search=${encodeURIComponent(val.trim())}&limit=10`
        );
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
        setCommercials((prev) => {
          if (
            prev.length === 1 &&
            (!prev[0].quantity || prev[0].serviceType === "WhatsApp API")
          ) {
            return [{ ...prev[0], serviceType: services[0] }];
          }
          return prev;
        });
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
    setCommercials([
      {
        serviceType: "WhatsApp API",
        quantity: "10000",
        quotedPrice: "0",
        stage: "quote_sent",
        closingDate: "",
        notes: "",
        contactBackDate: getDefaultNextDayFollowup(),
        demoDate: getDefaultTomorrowDemo(),
        userType: "new_user",
        paymentMode: "UPI / QR",
        wonDate: new Date().toISOString().split("T")[0],
      },
    ]);
    setShowLeadDrop(false);
  }

  function handleCreateAsNewCustomer() {
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

  // Commercials Management Handlers
  function handleAddCommercial(defaultService?: string) {
    const usedServices = commercials.map((c) => c.serviceType);
    const unusedService = selectedServices.find(
      (s) => !usedServices.includes(s)
    );
    const targetService =
      defaultService || unusedService || selectedServices[0] || "Bulk SMS";

    setCommercials((prev) => [
      ...prev,
      {
        serviceType: targetService,
        quantity: "10000",
        quotedPrice: "0",
        stage: "quote_sent",
        closingDate: prev[0]?.closingDate || "",
        notes: "",
        contactBackDate: getDefaultNextDayFollowup(),
        demoDate: getDefaultTomorrowDemo(),
        userType: "new_user",
        paymentMode: "UPI / QR",
        wonDate: new Date().toISOString().split("T")[0],
      },
    ]);
    toast.success(`Added new commercial section for ${targetService}`);
  }

  function handleRemoveCommercial(index: number) {
    if (commercials.length <= 1) {
      toast.error("At least one commercial block is required");
      return;
    }
    setCommercials((prev) => prev.filter((_, idx) => idx !== index));
    toast.info("Commercial section removed");
  }

  function updateCommercial(
    index: number,
    field: keyof CommercialItem,
    value: string
  ) {
    setCommercials((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;

        const updated = { ...item, [field]: value };

        // If stage changes, initialize default dates and values dynamically
        if (field === "stage") {
          if (value === "demo_scheduled" && !updated.demoDate) {
            updated.demoDate = getDefaultTomorrowDemo();
          }
          if ((value === "demo_done" || value === "quote_sent") && !updated.contactBackDate) {
            updated.contactBackDate = getDefaultNextDayFollowup();
          }
          if (value === "closed_won") {
            if (!updated.wonDate) updated.wonDate = new Date().toISOString().split("T")[0];
            if (!updated.executiveName) updated.executiveName = currentUser?.fullName || "Sales Executive";
            if (!updated.executiveEmail) updated.executiveEmail = currentUser?.email || "";
            if (!updated.userType) updated.userType = "new_user";
            if (!updated.paymentMode) updated.paymentMode = "Bank Transfer (NEFT/RTGS)";
            if (!updated.productName) updated.productName = updated.serviceType || "WhatsApp API";
            if (!updated.userId) updated.userId = leadId ? `TXT_${leadId.slice(0, 6).toUpperCase()}` : "";
            if (!updated.customerCompanyName) updated.customerCompanyName = companyName;
            if (!updated.customerName) updated.customerName = contactName;
            if (!updated.customerContactNumber) updated.customerContactNumber = phoneNumber;
            if (!updated.originalAmount) updated.originalAmount = updated.quotedPrice || "0";
            const base = parseFloat(updated.originalAmount || "0");
            const tax = (base * 0.18).toFixed(2);
            updated.taxAmount = tax;
            updated.finalAmount = (base * 1.18).toFixed(2);
          }
        }

        return updated;
      })
    );
  }

  // Totals calculations
  const totalQuotedValue = commercials.reduce(
    (sum, c) => sum + (parseFloat(c.quotedPrice) || 0),
    0
  );
  const totalCredits = commercials.reduce(
    (sum, c) => sum + (parseInt(c.quantity) || 0),
    0
  );

  async function handleSave() {
    if (!leadId && !phoneNumber.trim()) {
      toast.error("Please enter a phone number or select an existing lead");
      return;
    }

    if (selectedServices.length === 0) {
      toast.error("Please select at least one interested service");
      return;
    }

    // Validate all commercials dynamically per selected stage
    for (let i = 0; i < commercials.length; i++) {
      const c = commercials[i];
      if (!c.serviceType) {
        toast.error(`Please select a service for Commercial #${i + 1}`);
        return;
      }

      if (c.stage === "demo_scheduled") {
        if (!c.demoDate) {
          toast.error(`Please select Demo Scheduled Date & Time for Package #${i + 1}`);
          return;
        }
      } else if (c.stage === "demo_done" || c.stage === "quote_sent") {
        if (!c.quantity || parseInt(c.quantity) <= 0) {
          toast.error(`Please specify Quantity for Package #${i + 1}`);
          return;
        }
        if (c.quotedPrice === "" || isNaN(parseFloat(c.quotedPrice))) {
          toast.error(`Please specify Amount for Package #${i + 1}`);
          return;
        }
        if (!c.contactBackDate) {
          toast.error(`Please set contact back date for Package #${i + 1}`);
          return;
        }
      } else if (c.stage === "payment_pending") {
        if (!c.quantity || parseInt(c.quantity) <= 0) {
          toast.error(`Please specify Quantity for Package #${i + 1}`);
          return;
        }
        if (!c.quotedPrice || parseFloat(c.quotedPrice) <= 0) {
          toast.error(`Please specify Base Amount for Package #${i + 1}`);
          return;
        }
      } else if (c.stage === "closed_won") {
        if (!c.executiveEmail) {
          toast.error(`Executive Email ID is required for Closed Won in Package #${i + 1}`);
          return;
        }
        if (!c.userId) {
          toast.error(`Client Portal User ID is required for Closed Won in Package #${i + 1}`);
          return;
        }
        if (!c.customerEmail) {
          toast.error(`Customer Email ID is required for Closed Won in Package #${i + 1}`);
          return;
        }
        if (!c.paymentScreenshotUrl) {
          toast.error(`Payment Screenshot or UTR Reference is required for Closed Won in Package #${i + 1}`);
          return;
        }
      } else if (c.stage === "closed_lost") {
        if (!c.lostReason) {
          toast.error(`Please select a Lost Reason for Package #${i + 1}`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const method = isEdit ? "PATCH" : "POST";
      const url = isEdit ? `/api/deals/${deal!.id}` : "/api/deals";

      const firstC = commercials[0];
      const payload = isEdit
        ? {
            stage: firstC.stage,
            closingNotes: firstC.notes || firstC.demoNotes || firstC.demoFeedback || firstC.lostRemarks || null,
            quotedPrice: parseFloat(firstC.quotedPrice) || 0,
            expectedClosingDate: firstC.closingDate || null,
            serviceType: firstC.serviceType,
            quantity: parseInt(firstC.quantity) || 0,
            demoDate: firstC.demoDate,
            meetingLink: firstC.meetingLink,
            contactBackDate: firstC.contactBackDate,
            recontactDate: firstC.recontactDate,
            lostRemarks: firstC.lostRemarks,
            wonDetails: firstC.stage === "closed_won" ? {
              executiveName: firstC.executiveName,
              executiveEmail: firstC.executiveEmail,
              wonDate: firstC.wonDate,
              userType: firstC.userType,
              paymentMode: firstC.paymentMode,
              productName: firstC.productName,
              productDescription: firstC.productDescription,
              creditsToAdd: firstC.creditsToAdd || firstC.quantity,
              userId: firstC.userId,
              customerCompanyName: firstC.customerCompanyName || companyName,
              customerName: firstC.customerName || contactName,
              customerContactNumber: firstC.customerContactNumber || phoneNumber,
              customerEmail: firstC.customerEmail,
              originalAmount: firstC.originalAmount || firstC.quotedPrice,
              taxAmount: firstC.taxAmount,
              tds: firstC.tds,
              finalAmount: firstC.finalAmount,
              gstinNumber: firstC.gstinNumber,
              paymentScreenshotUrl: firstC.paymentScreenshotUrl,
            } : undefined,
            additionalCommercials: commercials.slice(1).map((c) => ({
              serviceType: c.serviceType,
              quantity: parseInt(c.quantity) || 0,
              quotedPrice: parseFloat(c.quotedPrice) || 0,
              stage: c.stage,
              expectedClosingDate: c.closingDate || null,
              closingNotes: c.notes || c.demoNotes || c.demoFeedback || c.lostRemarks || null,
            })),
          }
        : {
            leadId: leadId || undefined,
            phoneNumber: phoneNumber.trim(),
            contactName: contactName.trim() || null,
            companyName: companyName.trim() || null,
            address: address.trim() || null,
            serviceType: selectedServices.join(", "),
            commercials: commercials.map((c) => ({
              serviceType: c.serviceType,
              quantity: parseInt(c.quantity) || 0,
              quotedPrice: parseFloat(c.quotedPrice) || 0,
              stage: c.stage,
              expectedClosingDate: c.closingDate || null,
              closingNotes: c.notes || c.demoNotes || c.demoFeedback || c.lostRemarks || null,
              demoDate: c.demoDate,
              meetingLink: c.meetingLink,
              contactBackDate: c.contactBackDate,
              recontactDate: c.recontactDate,
              lostRemarks: c.lostRemarks,
              userType: c.userType,
              userId: c.userId,
              creditsToAdd: c.creditsToAdd,
              originalAmount: c.originalAmount,
              taxAmount: c.taxAmount,
              tds: c.tds,
              finalAmount: c.finalAmount,
              paymentMode: c.paymentMode,
              gstinNumber: c.gstinNumber,
              paymentScreenshotUrl: c.paymentScreenshotUrl,
            })),
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save deal");
        return;
      }

      toast.success(
        isEdit
          ? "Deal updated successfully ✅"
          : `Deal created (${commercials.length} package${commercials.length > 1 ? "s" : ""}) ✅`
      );
      onSaved();
    } catch {
      toast.error("Network error saving deal");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deal) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to delete deal");
        return;
      }
      toast.success("Deal deleted from pipeline ✅");
      onSaved();
    } catch {
      toast.error("Network error deleting deal");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-2xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto border border-gray-100 flex flex-col relative">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-xs z-20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-gray-200 transition"
              title="Close modal (Esc)"
              aria-label="Close modal"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 text-lg">
                  {isEdit
                    ? canEdit
                      ? "Edit Deal Pipeline"
                      : "Deal Details (View Only)"
                    : "Create New Deal"}
                </h3>
                {isEdit && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      canEdit
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    {canEdit ? "Level 2/3 Authorized" : "View Only (Level 2/3 to Edit)"}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {isEdit
                  ? canEdit
                    ? "Modify commercial values, package stages, or delete duplicate deals."
                    : "View deal details. Core edits and deletion are reserved for Level 2 & Level 3 users."
                  : "Select pipeline stage to dynamically adjust required commercial, demo, and onboarding fields."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition hidden sm:inline-flex"
            title="Close (Esc)"
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
                                Interested in:{" "}
                                <span className="text-gray-600">{l.serviceType}</span>
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
                      <p className="text-xs text-gray-500">
                        No leads found matching &ldquo;{leadSearch}&rdquo;
                      </p>
                    </div>
                  )}

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

            {/* Customer Details Inputs */}
            <div className="pt-2 border-t border-slate-200">
              <p className="text-[11px] font-semibold text-slate-600 mb-2.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Customer Dossier Details {leadId && "(Editable for this deal)"}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          {/* Section 2: Multi-Select Service Interests (No Custom) */}
          <div className="bg-emerald-50/40 border border-emerald-200/80 rounded-xl p-4">
            <MultiServiceSelect
              selectedServices={selectedServices}
              onChange={(services) => {
                setSelectedServices(services);
                if (services.length > 0 && commercials.length === 1 && !commercials[0].quantity) {
                  setCommercials([{ ...commercials[0], serviceType: services[0] }]);
                }
              }}
              label="Interested Services (Multiple selection & add/remove)"
              required
              placeholder="+ Add service interest (WhatsApp, SMS, RCS...)"
            />
          </div>

          {/* Section 3: Dynamic Deal Commercials & Pipeline Stage */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-emerald-600" />
                  Deal Commercials & Pipeline Stage
                  {commercials.length > 1 && (
                    <span className="text-[10px] text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full font-semibold">
                      {commercials.length} Packages
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Fields change dynamically based on the selected pipeline stage.
                </p>
              </div>

              {/* Quick shortcut pills to add commercials for unassigned services */}
              {selectedServices.some(
                (s) => !commercials.map((c) => c.serviceType).includes(s)
              ) && (
                <div className="hidden sm:flex items-center gap-1 text-[11px]">
                  <span className="text-gray-400">Quick add:</span>
                  {selectedServices
                    .filter((s) => !commercials.map((c) => c.serviceType).includes(s))
                    .map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleAddCommercial(s)}
                        className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition font-medium"
                      >
                        + {s}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Render Commercial Package Blocks */}
            <div className="space-y-5">
              {commercials.map((item, idx) => {
                const currentStageInfo = STAGES.find((s) => s.value === item.stage) || STAGES[2];
                const StageIcon = currentStageInfo.icon;

                return (
                  <div
                    key={idx}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 shadow-2xs relative transition-all"
                  >
                    {/* Header: Package Number, Service badge & Remove */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                          Commercial Package #{idx + 1}
                        </h5>
                        <span className="text-[11px] font-semibold text-emerald-900 bg-emerald-100/90 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                          {item.serviceType || "Select Service"}
                        </span>
                      </div>

                      {commercials.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCommercial(idx)}
                          className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 hover:bg-rose-50 px-2 py-1 rounded-lg transition"
                          title="Remove this commercial package"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Stage & Target Service Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Pipeline Stage Dropdown */}
                      <div>
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">
                          Pipeline Stage <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <select
                            value={item.stage}
                            onChange={(e) => updateCommercial(idx, "stage", e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-white border-2 border-emerald-600/40 focus:border-emerald-600 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-900 cursor-pointer shadow-2xs"
                          >
                            {STAGES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                          <StageIcon className="w-4 h-4 text-emerald-700 absolute left-2.5 top-2.5 pointer-events-none" />
                        </div>
                      </div>

                      {/* Respective Service Selection */}
                      <div>
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">
                          Respective Service Interest <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={item.serviceType}
                          onChange={(e) => updateCommercial(idx, "serviceType", e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-gray-800"
                        >
                          {selectedServices.length > 0 && (
                            <optgroup label="Selected Interested Services">
                              {selectedServices.map((svc) => (
                                <option key={svc} value={svc}>
                                  ⭐ {svc}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="All Available Services">
                            {SERVICE_INTERESTS.filter((s) => !selectedServices.includes(s)).map(
                              (svc) => (
                                <option key={svc} value={svc}>
                                  {svc}
                                </option>
                              )
                            )}
                          </optgroup>
                        </select>
                      </div>
                    </div>

                    {/* DYNAMIC STAGE FIELDS */}

                    {/* 1. STAGE: DEMO SCHEDULED */}
                    {item.stage === "demo_scheduled" && (
                      <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-purple-900 uppercase tracking-wide flex items-center gap-1.5">
                            <Video className="w-4 h-4 text-purple-600" />
                            Demo Scheduled Requirements
                          </span>
                          <span className="text-[10px] text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full font-medium">
                            Auto-syncs with Agenda Task
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Demo Date & Time <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="datetime-local"
                              value={item.demoDate || getDefaultTomorrowDemo()}
                              onChange={(e) => updateCommercial(idx, "demoDate", e.target.value)}
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Meeting Link (Google Meet / Zoom URL)
                            </label>
                            <input
                              type="url"
                              value={item.meetingLink || ""}
                              onChange={(e) => updateCommercial(idx, "meetingLink", e.target.value)}
                              placeholder="https://meet.google.com/abc-defg-hij"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-purple-500 font-mono text-gray-800"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Key Decision Maker / Attendee
                            </label>
                            <input
                              type="text"
                              value={item.decisionMakerName || contactName || ""}
                              onChange={(e) => updateCommercial(idx, "decisionMakerName", e.target.value)}
                              placeholder="e.g. Dr. Rajesh Sharma (Director)"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Target Credits / Volume Discussed
                            </label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateCommercial(idx, "quantity", e.target.value)}
                              placeholder="e.g. 50000"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-gray-700 mb-1 block">
                            Demo Agenda & Features to Demonstrate
                          </label>
                          <textarea
                            value={item.demoNotes || item.notes || ""}
                            onChange={(e) => {
                              updateCommercial(idx, "demoNotes", e.target.value);
                              updateCommercial(idx, "notes", e.target.value);
                            }}
                            rows={2}
                            placeholder="WhatsApp Business API walkthrough, template approvals, auto-reply chatbot, CRM integration..."
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-purple-500 resize-none text-gray-800"
                          />
                        </div>
                      </div>
                    )}

                    {/* 2. STAGE: DEMO DONE */}
                    {item.stage === "demo_done" && (
                      <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-teal-900 uppercase tracking-wide flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-teal-600" />
                            Demo Done — Follow-Up & Commercials
                          </span>
                          <span className="text-[10px] text-teal-800 bg-teal-100 px-2 py-0.5 rounded-full font-medium">
                            Default: Next Day 11:00 AM
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              When to Contact Back for Update? <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="datetime-local"
                              value={item.contactBackDate || getDefaultNextDayFollowup()}
                              onChange={(e) => updateCommercial(idx, "contactBackDate", e.target.value)}
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                            />
                            <p className="text-[10px] text-teal-700 mt-1">
                              ⚡ Automatically scheduled for next business day at 11:00 AM.
                            </p>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Follow-Up Channel
                            </label>
                            <select
                              value={item.followupChannel || "phone"}
                              onChange={(e) => updateCommercial(idx, "followupChannel", e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                            >
                              <option value="phone">📞 Phone Call</option>
                              <option value="whatsapp">💬 WhatsApp Message</option>
                              <option value="email">📧 Email Follow-up</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Credits / Volume Discussed <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateCommercial(idx, "quantity", e.target.value)}
                              placeholder="e.g. 25000"
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Estimated Budget / Quoted Price (₹) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              value={item.quotedPrice}
                              onChange={(e) => updateCommercial(idx, "quotedPrice", e.target.value)}
                              placeholder="e.g. 15000"
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-gray-700 mb-1 block">
                            Client Feedback & Discussion Points During Demo
                          </label>
                          <textarea
                            value={item.demoFeedback || item.notes || ""}
                            onChange={(e) => {
                              updateCommercial(idx, "demoFeedback", e.target.value);
                              updateCommercial(idx, "notes", e.target.value);
                            }}
                            rows={2}
                            placeholder="Client positive on WhatsApp API, asked to share formal quote for 25k credits with SLA details..."
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-teal-500 resize-none text-gray-800"
                          />
                        </div>
                      </div>
                    )}

                    {/* 3. STAGE: QUOTE SENT */}
                    {item.stage === "quote_sent" && (
                      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-amber-600" />
                            Quote Sent — Commercials & Contact Back
                          </span>
                          <span className="text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                            Default Contact: Next Day 11:00 AM
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Services Quantity (Credits) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateCommercial(idx, "quantity", e.target.value)}
                              placeholder="e.g. 50000"
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Quoted Amount (₹ INR) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              value={item.quotedPrice}
                              onChange={(e) => updateCommercial(idx, "quotedPrice", e.target.value)}
                              placeholder="e.g. 25000"
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Contact Back Date for Update <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="datetime-local"
                              value={item.contactBackDate || getDefaultNextDayFollowup()}
                              onChange={(e) => updateCommercial(idx, "contactBackDate", e.target.value)}
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                            />
                            <p className="text-[10px] text-amber-700 mt-1">
                              ⚡ Default: Next business day at 11:00 AM for quotation follow-up.
                            </p>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Quote Validity / Expected Close Date
                            </label>
                            <input
                              type="date"
                              value={item.closingDate}
                              onChange={(e) => updateCommercial(idx, "closingDate", e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-gray-700 mb-1 block">
                            Quotation Terms & Negotiation Notes
                          </label>
                          <textarea
                            value={item.notes}
                            onChange={(e) => updateCommercial(idx, "notes", e.target.value)}
                            rows={2}
                            placeholder="Official quote PDF sent on WhatsApp/Email. Promised volume pricing 26p/WA message if closed this week..."
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500 resize-none text-gray-800"
                          />
                        </div>
                      </div>
                    )}

                    {/* 4. STAGE: PAYMENT PENDING */}
                    {item.stage === "payment_pending" && (
                      <div className="bg-orange-50/70 border border-orange-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-orange-900 uppercase tracking-wide flex items-center gap-1.5">
                            <DollarSign className="w-4 h-4 text-orange-600" />
                            Payment Pending — Service Commercials & Due Date
                          </span>
                          <span className="text-[10px] text-orange-800 bg-orange-100 px-2 py-0.5 rounded-full font-medium">
                            Awaiting Transfer
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Services Quantity (Credits) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateCommercial(idx, "quantity", e.target.value)}
                              placeholder="e.g. 50000"
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Original Amount (₹ Base) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              value={item.quotedPrice}
                              onChange={(e) => updateCommercial(idx, "quotedPrice", e.target.value)}
                              placeholder="e.g. 20000"
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Expected Payment Mode <span className="text-rose-500">*</span>
                            </label>
                            <select
                              value={item.paymentMode || "UPI / QR"}
                              onChange={(e) => updateCommercial(idx, "paymentMode", e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-500 font-medium"
                            >
                              <option value="UPI / QR">UPI / QR Code</option>
                              <option value="Bank Transfer (NEFT/RTGS)">Bank Transfer (NEFT / RTGS)</option>
                              <option value="Credit/Debit Card">Credit / Debit Card</option>
                              <option value="Net Banking">Net Banking</option>
                              <option value="Cheque">Cheque</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Payment Due Date <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={item.closingDate || new Date().toISOString().split("T")[0]}
                              onChange={(e) => updateCommercial(idx, "closingDate", e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-500 font-medium"
                            />
                          </div>
                        </div>

                        {/* GST breakdown */}
                        <div className="bg-white/90 border border-orange-200 rounded-lg p-2.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="text-gray-500">Base:</span>{" "}
                            <strong className="text-gray-800">
                              ₹{parseFloat(item.quotedPrice || "0").toLocaleString("en-IN")}
                            </strong>
                          </div>
                          <div>
                            <span className="text-gray-500">+ 18% GST:</span>{" "}
                            <strong className="text-gray-800">
                              ₹{(parseFloat(item.quotedPrice || "0") * 0.18).toLocaleString("en-IN")}
                            </strong>
                          </div>
                          <div className="text-orange-950 font-bold">
                            <span>Total Payable:</span>{" "}
                            <span className="text-emerald-700 font-mono">
                              ₹{(parseFloat(item.quotedPrice || "0") * 1.18).toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-gray-700 mb-1 block">
                            Payment Follow-up / Release Remarks
                          </label>
                          <textarea
                            value={item.notes}
                            onChange={(e) => updateCommercial(idx, "notes", e.target.value)}
                            rows={2}
                            placeholder="Proforma invoice shared. Finance person confirmed NEFT will be initiated by 2 PM..."
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-500 resize-none text-gray-800"
                          />
                        </div>
                      </div>
                    )}

                    {/* 5. STAGE: CLOSED WON (19 Detailed Onboarding & Finance Fields) */}
                    {item.stage === "closed_won" && (
                      <div className="bg-emerald-50/80 border-2 border-emerald-300 rounded-xl p-4 space-y-4 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between border-b border-emerald-200 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-base">🏆</span>
                            <div>
                              <h5 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                                Closed Won — Client Onboarding & Billing Dossier
                              </h5>
                              <p className="text-[11px] text-emerald-700">
                                Verify and complete the customer details below for activation.
                              </p>
                            </div>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full">
                            Operations Approval Queue
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          {/* 1. Executive Name */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Executive Name
                            </label>
                            <input
                              type="text"
                              value={item.executiveName ?? (currentUser?.fullName || "Sales Executive")}
                              onChange={(e) => updateCommercial(idx, "executiveName", e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                            />
                          </div>

                          {/* 2. *Executive Email ID */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              *Executive Email ID <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="email"
                              value={item.executiveEmail ?? (currentUser?.email || "")}
                              onChange={(e) => updateCommercial(idx, "executiveEmail", e.target.value)}
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                            />
                          </div>

                          {/* 3. Date */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Date <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={item.wonDate || new Date().toISOString().split("T")[0]}
                              onChange={(e) => updateCommercial(idx, "wonDate", e.target.value)}
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                            />
                          </div>

                          {/* 4. User Type */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              User Type <span className="text-rose-500">*</span>
                            </label>
                            <select
                              value={item.userType || "new_user"}
                              onChange={(e) => updateCommercial(idx, "userType", e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                            >
                              <option value="new_user">New User</option>
                              <option value="existing_user">Existing User (Top-up)</option>
                              <option value="reseller">Reseller / White-label Partner</option>
                            </select>
                          </div>

                          {/* 5. Payment Mode */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Payment Mode <span className="text-rose-500">*</span>
                            </label>
                            <select
                              value={item.paymentMode || "Bank Transfer (NEFT/RTGS)"}
                              onChange={(e) => updateCommercial(idx, "paymentMode", e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                            >
                              <option value="Bank Transfer (NEFT/RTGS)">Bank Transfer (NEFT / RTGS)</option>
                              <option value="UPI / QR">UPI / QR Code</option>
                              <option value="Credit/Debit Card">Credit / Debit Card</option>
                              <option value="Net Banking">Net Banking</option>
                              <option value="Cheque">Cheque</option>
                              <option value="Payment Gateway">Payment Gateway</option>
                            </select>
                          </div>

                          {/* 6. Product Name */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Product Name <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={item.productName || item.serviceType || "WhatsApp API"}
                              onChange={(e) => updateCommercial(idx, "productName", e.target.value)}
                              placeholder="e.g. WhatsApp API / Bulk SMS"
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                            />
                          </div>

                          {/* 7. Credits to be Added */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Credits to be Added <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              value={item.creditsToAdd || item.quantity || ""}
                              onChange={(e) => {
                                updateCommercial(idx, "creditsToAdd", e.target.value);
                                updateCommercial(idx, "quantity", e.target.value);
                              }}
                              placeholder="e.g. 50000"
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                            />
                          </div>

                          {/* 8. User ID */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              User ID (Portal / Client Account ID) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={item.userId || (leadId ? `TXT_${leadId.slice(0, 6).toUpperCase()}` : "")}
                              onChange={(e) => updateCommercial(idx, "userId", e.target.value)}
                              placeholder="e.g. TXT_99021 or client portal username"
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-emerald-900 font-bold"
                            />
                          </div>

                          {/* 9. Customer Company Name */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Customer Company Name
                            </label>
                            <input
                              type="text"
                              value={item.customerCompanyName ?? companyName}
                              onChange={(e) => updateCommercial(idx, "customerCompanyName", e.target.value)}
                              placeholder="Company name"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                            />
                          </div>

                          {/* 10. Customer Name */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Customer Name
                            </label>
                            <input
                              type="text"
                              value={item.customerName ?? contactName}
                              onChange={(e) => updateCommercial(idx, "customerName", e.target.value)}
                              placeholder="Customer contact person"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                            />
                          </div>

                          {/* 11. Customer Contact Number */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Customer Contact Number <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="tel"
                              value={item.customerContactNumber ?? phoneNumber}
                              onChange={(e) => updateCommercial(idx, "customerContactNumber", e.target.value)}
                              required
                              placeholder="e.g. 9876543210"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                            />
                          </div>

                          {/* 12. Customer Email ID */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Customer Email ID <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="email"
                              value={item.customerEmail || ""}
                              onChange={(e) => updateCommercial(idx, "customerEmail", e.target.value)}
                              required
                              placeholder="billing@customercompany.com"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                            />
                          </div>

                          {/* 13. Product Descriptions */}
                          <div className="sm:col-span-2">
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Product Descriptions
                            </label>
                            <textarea
                              value={item.productDescription || ""}
                              onChange={(e) => updateCommercial(idx, "productDescription", e.target.value)}
                              rows={2}
                              placeholder="Detailed package specs, rate per message (e.g. 0.28/WA), green tick setup, DLT template registration included..."
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 resize-none text-gray-800"
                            />
                          </div>

                          {/* 14. Original Amount */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Original Amount (₹ Base) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              value={item.originalAmount || item.quotedPrice || ""}
                              onChange={(e) => {
                                const orig = e.target.value;
                                const num = parseFloat(orig) || 0;
                                const tax = (num * 0.18).toFixed(2);
                                const tdsVal = parseFloat(item.tds || "0") || 0;
                                const finalVal = Math.max(0, num + parseFloat(tax) - tdsVal).toFixed(2);
                                updateCommercial(idx, "originalAmount", orig);
                                updateCommercial(idx, "quotedPrice", orig);
                                updateCommercial(idx, "taxAmount", tax);
                                updateCommercial(idx, "finalAmount", finalVal);
                              }}
                              placeholder="e.g. 50000"
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                            />
                          </div>

                          {/* 15. Tax Amount */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Tax Amount (₹ 18% GST)
                            </label>
                            <input
                              type="number"
                              value={item.taxAmount ?? (parseFloat(item.originalAmount || item.quotedPrice || "0") * 0.18).toFixed(2)}
                              onChange={(e) => {
                                const tax = e.target.value;
                                const orig = parseFloat(item.originalAmount || item.quotedPrice || "0") || 0;
                                const tdsVal = parseFloat(item.tds || "0") || 0;
                                const finalVal = Math.max(0, orig + (parseFloat(tax) || 0) - tdsVal).toFixed(2);
                                updateCommercial(idx, "taxAmount", tax);
                                updateCommercial(idx, "finalAmount", finalVal);
                              }}
                              className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                            />
                          </div>

                          {/* 16. TDS */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              TDS (₹ Deducted if any)
                            </label>
                            <input
                              type="number"
                              value={item.tds || "0"}
                              onChange={(e) => {
                                const tdsVal = e.target.value;
                                const orig = parseFloat(item.originalAmount || item.quotedPrice || "0") || 0;
                                const tax = parseFloat(item.taxAmount || "0") || (orig * 0.18);
                                const finalVal = Math.max(0, orig + tax - (parseFloat(tdsVal) || 0)).toFixed(2);
                                updateCommercial(idx, "tds", tdsVal);
                                updateCommercial(idx, "finalAmount", finalVal);
                              }}
                              placeholder="0"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                            />
                          </div>

                          {/* 17. Final Amount */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Final Amount (₹ Total Received) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              value={item.finalAmount ?? (parseFloat(item.originalAmount || item.quotedPrice || "0") * 1.18).toFixed(2)}
                              onChange={(e) => updateCommercial(idx, "finalAmount", e.target.value)}
                              required
                              className="w-full px-3 py-2 bg-emerald-50/80 border border-emerald-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold text-emerald-900"
                            />
                          </div>

                          {/* 18. GSTIN Number */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              GSTIN Number (Optional)
                            </label>
                            <input
                              type="text"
                              value={item.gstinNumber || ""}
                              onChange={(e) => updateCommercial(idx, "gstinNumber", e.target.value.toUpperCase())}
                              placeholder="29AAAAA0000A1Z5"
                              maxLength={15}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                            />
                          </div>

                          {/* 19. Payment Screenshot */}
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Payment Screenshot / UTR Reference <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={item.paymentScreenshotUrl || ""}
                              onChange={(e) => updateCommercial(idx, "paymentScreenshotUrl", e.target.value)}
                              placeholder="Paste UTR / Bank Ref or upload image link"
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 6. STAGE: CLOSED LOST (With Guidelines Answer) */}
                    {item.stage === "closed_lost" && (
                      <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-4 space-y-3.5 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between border-b border-rose-200 pb-2">
                          <div className="flex items-center gap-1.5 font-bold text-rose-950 text-xs">
                            <AlertOctagon className="w-4 h-4 text-rose-600" />
                            <span>Closed Lost Record & Post-Mortem</span>
                          </div>
                          <span className="text-[10px] text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full font-medium">
                            Lost Analysis
                          </span>
                        </div>

                        {/* Guide answering: When will it be closed lost? */}
                        <div className="bg-white/90 border border-rose-200 rounded-lg p-3 text-[11px] text-rose-900 space-y-1.5">
                          <p className="font-bold text-rose-950 flex items-center gap-1">
                            <span>💡</span> When should a deal be marked as Closed Lost?
                          </p>
                          <ul className="list-disc list-inside space-y-1 text-rose-800">
                            <li>
                              <strong>Client Chose a Competitor:</strong> Customer opted for another provider (e.g. pricing gap or existing contract).
                            </li>
                            <li>
                              <strong>Budget / Price Disconnect:</strong> Customer confirmed no funds are allocated or minimum package exceeds budget.
                            </li>
                            <li>
                              <strong>Unresponsive / Ghosted:</strong> 3+ attempts across Call, WhatsApp, & Email over 14+ days with zero reply.
                            </li>
                            <li>
                              <strong>Project Cancelled:</strong> Client dropped the marketing campaign or paused business operations.
                            </li>
                            <li>
                              <strong>Policy / Feature Incompatibility:</strong> Client requires disallowed content under Meta WhatsApp API policies.
                            </li>
                          </ul>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Primary Lost Reason <span className="text-rose-500">*</span>
                            </label>
                            <select
                              value={item.lostReason || "Chose Competitor"}
                              onChange={(e) => updateCommercial(idx, "lostReason", e.target.value)}
                              required
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                            >
                              <option value="Chose Competitor">Chose Competitor</option>
                              <option value="Budget / Pricing Mismatch">Budget / Pricing Mismatch</option>
                              <option value="Unresponsive / Ghosted (3+ Follow-ups)">Unresponsive / Ghosted (3+ Follow-ups)</option>
                              <option value="Feature / Policy Incompatibility">Feature / Policy Incompatibility</option>
                              <option value="Project Cancelled / Dropped">Project Cancelled / Dropped</option>
                              <option value="In-House Solution Built">In-House Solution Built</option>
                              <option value="Other">Other Reason</option>
                            </select>
                          </div>

                          {item.lostReason === "Chose Competitor" && (
                            <div>
                              <label className="font-semibold text-gray-700 mb-1 block">
                                Competitor Name
                              </label>
                              <input
                                type="text"
                                value={item.competitorName || ""}
                                onChange={(e) => updateCommercial(idx, "competitorName", e.target.value)}
                                placeholder="e.g. Gupshup, Wati, Aisensy, Kaleyra"
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-rose-500"
                              />
                            </div>
                          )}

                          <div>
                            <label className="font-semibold text-gray-700 mb-1 block">
                              Future Re-contact / Renewal Date (Optional)
                            </label>
                            <input
                              type="date"
                              value={item.recontactDate || ""}
                              onChange={(e) => updateCommercial(idx, "recontactDate", e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-rose-500"
                            />
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              Follow up when their competitor annual contract is up for renewal.
                            </p>
                          </div>
                        </div>

                        <div>
                          <label className="font-semibold text-gray-700 mb-1 block">
                            Lost Remarks & Customer Feedback
                          </label>
                          <textarea
                            value={item.lostRemarks || item.notes || ""}
                            onChange={(e) => {
                              updateCommercial(idx, "lostRemarks", e.target.value);
                              updateCommercial(idx, "notes", e.target.value);
                            }}
                            rows={2}
                            placeholder="Feedback shared by client, what pricing or feature they got elsewhere, or key takeaways..."
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-rose-500 resize-none text-gray-800"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Button to Add Additional Deal Commercial & Pipeline Stage */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleAddCommercial()}
                className="px-4 py-2.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-2 border-dashed border-emerald-300 hover:border-emerald-400 rounded-xl flex items-center justify-center gap-2 transition shadow-2xs group"
              >
                <Plus className="w-4 h-4 text-emerald-700 group-hover:scale-110 transition" />
                <span>+ Add Commercial & Pipeline Stage for Additional Service</span>
              </button>

              {/* Commercials Summary Badge */}
              {commercials.length > 1 && (
                <div className="text-xs font-medium text-slate-700 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200 flex items-center justify-between sm:justify-start gap-3">
                  <span>
                    Packages: <strong>{commercials.length}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Total Credits:{" "}
                    <strong>{totalCredits.toLocaleString("en-IN")}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Total Value:{" "}
                    <strong className="text-emerald-700 font-mono">
                      {formatCurrency(totalQuotedValue)}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/80 sticky bottom-0 z-20">
          <div className="flex items-center gap-3">
            {isEdit && canDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting || saving}
                className="px-3.5 py-2 text-xs text-rose-600 hover:text-white hover:bg-rose-600 bg-rose-50 border border-rose-200 hover:border-rose-600 rounded-lg font-semibold transition flex items-center gap-1.5 shadow-2xs"
                title="Permanently remove deal from pipeline (Level 2 & Level 3)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Deal</span>
              </button>
            )}

            <p className="text-[11px] text-gray-500">
              {leadId ? (
                <span className="text-emerald-700 font-medium">
                  Linked to existing lead ({leadId.slice(0, 8)}...)
                </span>
              ) : (
                <span>A new lead record will automatically be created.</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-white font-medium transition"
            >
              {isEdit && !canEdit ? "Close" : "Cancel"}
            </button>
            {(!isEdit || canEdit) && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || deleting}
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
                    <span>
                      {isEdit
                        ? "Update Deal"
                        : commercials.length > 1
                        ? `Save & Create ${commercials.length} Deal Packages`
                        : "Save & Create Deal"}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-2xs animate-in fade-in duration-150">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 border border-slate-200 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Delete Deal from Pipeline?
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Are you sure you want to delete this deal for{" "}
                    <strong>{companyName || contactName || "this customer"}</strong>?
                    This will remove the deal and its metrics permanently from the pipeline.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-xs transition"
                >
                  {deleting ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Yes, Delete Deal
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
