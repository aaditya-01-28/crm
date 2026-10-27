"use client";

import { useState } from "react";
import { Sparkles, Copy, Check, MessageSquare, CheckCircle, HelpCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface SalesScriptAssistantProps {
  lead: {
    contactName: string | null;
    companyName: string | null;
    serviceType: string | null;
    businessVertical: string | null;
    phoneNumber: string;
  };
  onOpenWhatsAppModal: () => void;
  sessionCallCount?: number;
}

export function SalesScriptAssistant({
  lead,
  onOpenWhatsAppModal,
  sessionCallCount = 0,
}: SalesScriptAssistantProps) {
  const [activeTab, setActiveTab] = useState<"pitch" | "qualify" | "objections">("pitch");
  const [copiedPitch, setCopiedPitch] = useState(false);

  const prospectName = lead.contactName || lead.companyName || "the team";
  const company = lead.companyName || "your company";

  const dynamicIntro = `Hi, is this ${prospectName} at ${company}? I'm calling from Textora Technologies. I noticed you're receiving customer inquiries and wanted to see if you have official Meta Green Tick WhatsApp API enabled for broadcast campaigns and instant transactional OTPs?`;

  function handleCopyIntro() {
    navigator.clipboard.writeText(dynamicIntro);
    setCopiedPitch(true);
    toast.success("Script copied to clipboard!");
    setTimeout(() => setCopiedPitch(false), 2000);
  }

  const targetCalls = 60;
  const progressPercent = Math.min(100, Math.round((sessionCallCount / targetCalls) * 100));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs overflow-hidden">
        {/* Assistant Header */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-900">Live Sales Script & Objection Cheatsheet</h3>
              <p className="text-[10px] text-gray-500">Contextual pitch helper for reps</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            CPaaS Playbook
          </span>
        </div>

        {/* Script Tabs */}
        <div className="border-b border-gray-100 flex p-1 bg-gray-50 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("pitch")}
            className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === "pitch"
                ? "bg-white text-gray-900 shadow-2xs"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Opening Pitch
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("qualify")}
            className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === "qualify"
                ? "bg-white text-gray-900 shadow-2xs"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Qualifying
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("objections")}
            className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === "objections"
                ? "bg-white text-gray-900 shadow-2xs"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Objections
          </button>
        </div>

        {/* Tab 1: Opening Pitch */}
        {activeTab === "pitch" && (
          <div className="p-5 space-y-4 text-xs animate-in fade-in duration-100">
            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <div className="font-bold text-emerald-950 text-xs mb-1 flex items-center justify-between">
                <span>Standard Introduction (WhatsApp API)</span>
                <span className="text-[10px] text-emerald-700 bg-emerald-100/80 px-1.5 py-0.2 rounded font-mono">
                  Personalized
                </span>
              </div>
              <p className="text-gray-700 leading-relaxed italic">
                "{dynamicIntro}"
              </p>
              <button
                type="button"
                onClick={handleCopyIntro}
                className="mt-2.5 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 cursor-pointer"
              >
                {copiedPitch ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedPitch ? "Copied!" : "Copy to Clipboard"}
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Key Value Highlights
              </div>
              <ul className="space-y-2 text-gray-600 text-xs">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Official Meta Cloud API — zero server maintenance or downtime</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Starter package with 50,000 units at ₹2,950 only</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Sub-second OTP delivery & live CRM companion sync</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Tab 2: Qualifying Questions */}
        {activeTab === "qualify" && (
          <div className="p-5 space-y-3 text-xs animate-in fade-in duration-100">
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-1">
              <div className="font-bold text-gray-800">1. Current Monthly Message Volume</div>
              <p className="text-gray-500 text-[11px] italic">
                "How many messages or OTP broadcasts do you typically send each month to active leads?"
              </p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-1">
              <div className="font-bold text-gray-800">2. Green Tick Verification Need</div>
              <p className="text-gray-500 text-[11px] italic">
                "Are you looking to get the official verified green checkmark badge next to your company name on WhatsApp?"
              </p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-1">
              <div className="font-bold text-gray-800">3. CRM & Webhook Integration</div>
              <p className="text-gray-500 text-[11px] italic">
                "Do you use Shopify, Zoho, LeadSquared, or an internal dashboard where you need automatic lead routing?"
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Objection Cheatsheet */}
        {activeTab === "objections" && (
          <div className="p-5 space-y-3 text-xs animate-in fade-in duration-100">
            <div className="p-3 rounded-xl bg-rose-50/50 border border-rose-200 space-y-1">
              <div className="font-bold text-rose-900">
                "We are already using another provider (Wati / Gupshup)"
              </div>
              <p className="text-gray-600 text-[11px] leading-relaxed">
                "Many of our top clients switched to Textora because we offer zero markup Meta pricing with sub-second OTP deliverability and dedicated account managers on WhatsApp."
              </p>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-200 space-y-1">
              <div className="font-bold text-amber-900">"Send details on WhatsApp first"</div>
              <p className="text-gray-600 text-[11px] leading-relaxed">
                "Certainly! I am triggering our official PDF brochure with rate card to your WhatsApp right now. Let me schedule a 10-minute quick walkthrough for you tomorrow."
              </p>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200 space-y-1">
              <div className="font-bold text-blue-900">"Cost is too high"</div>
              <p className="text-gray-600 text-[11px] leading-relaxed">
                "Our base package starts at just ₹2,950 for 50,000 units with free template approvals and complete onboarding support."
              </p>
            </div>
          </div>
        )}

        {/* Quick WhatsApp Action Bar */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[11px] text-gray-500 font-medium">
            Need to send catalog or quotation?
          </span>
          <button
            type="button"
            onClick={onOpenWhatsAppModal}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Send WA Template</span>
          </button>
        </div>
      </div>

      {/* Daily Performance Meter */}
      <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-gray-800">Your Daily Calling Progress</h4>
          <span className="text-[11px] font-mono font-bold text-emerald-600">
            {sessionCallCount} Dials Completed
          </span>
        </div>
        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-gray-400">
          <span>Target: {targetCalls} Calls/Day</span>
          <span>{Math.max(0, targetCalls - sessionCallCount)} remaining</span>
        </div>
      </div>
    </div>
  );
}
