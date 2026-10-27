"use client";

import { useState } from "react";
import { X, Send, Copy, Check, MessageSquare, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export interface WhatsAppTemplate {
  id: string;
  name: string;
  category: string;
  badge: string;
  text: (lead: { contactName?: string | null; companyName?: string | null; phoneNumber: string }) => string;
}

export const WA_PREAPPROVED_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "brochure",
    name: "CPaaS Brochure & API Catalog",
    category: "Introduction",
    badge: "Official Meta",
    text: (lead) =>
      `Hello ${lead.contactName || lead.companyName || "there"}! Thank you for speaking with Textora Technologies. Here is our official Meta WhatsApp API documentation, Green Tick verification guide, and feature rate card: https://textorasms.com/resources/cpaas-brochure.pdf. Let us know if you have any questions!`,
  },
  {
    id: "quote_starter",
    name: "Starter Package Quotation (₹2,950)",
    category: "Quotation",
    badge: "Most Popular",
    text: (lead) =>
      `Hello ${lead.contactName || lead.companyName || "there"}! As discussed, here is your customized quotation for the Textora Starter Package: 50,000 WhatsApp API units at ₹2,950 (all inclusive). You can complete business verification and activate your lines instantly.`,
  },
  {
    id: "demo_invite",
    name: "Live 1-on-1 Product Demo Invite",
    category: "Demonstration",
    badge: "Google Meet",
    text: (lead) =>
      `Hi ${lead.contactName || lead.companyName || "there"}! Your 1-on-1 walkthrough for Textora Engage & WhatsApp Broadcast Engine has been scheduled. Meeting link: https://meet.google.com/tex-tora-crm. Looking forward to our conversation!`,
  },
  {
    id: "followup_missed",
    name: "Missed Call / Follow-up Reconnect",
    category: "Follow-up",
    badge: "High Response",
    text: (lead) =>
      `Hi ${lead.contactName || lead.companyName || "there"} from Textora Technologies! We tried reaching you regarding your inquiry on WhatsApp Business API solutions. Feel free to reply back here or let us know a convenient time to reconnect.`,
  },
];

interface WhatsAppTemplateModalProps {
  lead: {
    id: string;
    phoneNumber: string;
    contactName: string | null;
    companyName: string | null;
  };
  onClose: () => void;
}

export function WhatsAppTemplateModal({ lead, onClose }: WhatsAppTemplateModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("brochure");
  const [copied, setCopied] = useState(false);

  const selectedTemplate =
    WA_PREAPPROVED_TEMPLATES.find((t) => t.id === selectedTemplateId) ||
    WA_PREAPPROVED_TEMPLATES[0];

  const [customText, setCustomText] = useState(selectedTemplate.text(lead));

  function handleSelectTemplate(tId: string) {
    setSelectedTemplateId(tId);
    const tmpl = WA_PREAPPROVED_TEMPLATES.find((t) => t.id === tId);
    if (tmpl) {
      setCustomText(tmpl.text(lead));
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(customText);
    setCopied(true);
    toast.success("Template text copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSend() {
    const cleanDigits = lead.phoneNumber.replace(/\D/g, "");
    const phone = cleanDigits.length > 10 ? cleanDigits.slice(-10) : cleanDigits;
    const encoded = encodeURIComponent(customText);
    const waUrl = `https://wa.me/91${phone}?text=${encoded}`;

    window.open(waUrl, "_blank", "noopener,noreferrer");
    toast.success(`Opening WhatsApp for +91 ${phone}...`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-gray-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-emerald-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-tight">Quick WhatsApp Message</h3>
              <p className="text-emerald-100 text-xs">
                To: {lead.contactName ? `${lead.contactName} (${lead.companyName || "Lead"})` : lead.companyName || "Lead"} • {lead.phoneNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block mb-2">
              Select Meta Pre-Approved Template
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {WA_PREAPPROVED_TEMPLATES.map((tmpl) => {
                const isSelected = tmpl.id === selectedTemplateId;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tmpl.id)}
                    className={`text-left p-3 rounded-xl border text-xs transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "bg-emerald-50/80 border-emerald-500 ring-1 ring-emerald-500 text-emerald-950 font-semibold"
                        : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold truncate text-[11px]">{tmpl.name}</span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                          isSelected ? "bg-emerald-200 text-emerald-900" : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {tmpl.badge}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500">{tmpl.category}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Message Preview & Edit
              </label>
              <span className="text-[10px] text-gray-400 font-mono">
                {customText.length} characters
              </span>
            </div>
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={5}
              className="w-full text-xs p-3.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 leading-relaxed font-sans text-gray-800 resize-none"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 rounded-xl transition flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy Text"}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              className="px-5 py-2 text-xs font-bold bg-[#00b87c] hover:bg-[#00a36c] text-white rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Launch WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
