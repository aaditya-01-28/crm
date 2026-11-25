"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, RefreshCw, PhoneCall, Sparkles, Smartphone, CheckCircle } from "lucide-react";
import { DialerCard } from "@/components/dialer/DialerCard";
import { SalesScriptAssistant } from "@/components/dialer/SalesScriptAssistant";
import { WhatsAppTemplateModal } from "@/components/dialer/WhatsAppTemplateModal";
import { CSVImporter } from "@/components/dialer/CSVImporter";
import { toast } from "sonner";
import { useCanImportLeads, useSession } from "@/components/layout/SessionProvider";

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

async function fetchNextLead(): Promise<{ lead: Lead | null }> {
  const res = await fetch("/api/leads?queue=true");
  if (!res.ok) throw new Error("Failed to fetch lead");
  return res.json();
}

export default function DialerPage() {
  const queryClient = useQueryClient();
  const { role, userId } = useSession();
  const [showImporter, setShowImporter] = useState(false);
  const [showWAModal, setShowWAModal] = useState(false);
  const canImport = useCanImportLeads();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dialer-queue"],
    queryFn: fetchNextLead,
    refetchOnWindowFocus: false,
  });

  // Fetch today's actual call stats + assigned daily calling target
  const { data: todayProgressData, refetch: refetchProgress } = useQuery({
    queryKey: ["dialer-daily-progress", userId],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const callsParams = new URLSearchParams({
        dateFrom: todayStart.toISOString(),
        limit: "1",
      });
      if (userId) callsParams.set("repId", userId);

      const [callsRes, profileRes] = await Promise.all([
        fetch(`/api/calls?${callsParams.toString()}`),
        fetch("/api/profile"),
      ]);
      const callsJson = callsRes.ok ? await callsRes.json() : null;
      const profileJson = profileRes.ok ? await profileRes.json() : null;
      return {
        todayCalls: callsJson?.summary?.totalCalls ?? 0,
        dailyCallTarget: profileJson?.user?.dailyCallTarget ?? 60,
      };
    },
    refetchInterval: 20000,
  });

  const todayCallsCount = todayProgressData?.todayCalls ?? 0;
  const dailyCallTarget = todayProgressData?.dailyCallTarget ?? 60;

  const lead = data?.lead;

  function onDisposed(nextLead: Lead | null) {
    refetchProgress();
    if (nextLead) {
      queryClient.setQueryData(["dialer-queue"], { lead: nextLead });
    } else {
      queryClient.invalidateQueries({ queryKey: ["dialer-queue"] });
      toast.info("🎉 Queue complete! All assigned leads have been worked.");
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
            <PhoneCall className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Smart Dialer Studio</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {role === "sales_manager"
                  ? "Level 2 Manager"
                  : role === "super_admin"
                  ? "Level 3 Super Admin"
                  : "Level 1 Representative"}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              High-velocity power dialing with companion push-to-dial, objection handling & live script assistance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Companion Phone Status Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <Smartphone className="w-3.5 h-3.5 text-gray-500" />
            <span>Companion Ready</span>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
            <span>Refresh</span>
          </button>

          {canImport && (
            <button
              type="button"
              onClick={() => setShowImporter(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Studio Content */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-xs">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-gray-600">Retrieving assigned queue lead...</p>
        </div>
      ) : isError ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <p className="text-sm text-red-600 font-semibold">Failed to load lead queue</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 text-xs text-red-600 underline font-medium cursor-pointer"
          >
            Try reloading queue
          </button>
        </div>
      ) : !lead ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-xs max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100">
            <CheckCircle className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-gray-800">Queue Complete!</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            {role === "sales_rep"
              ? "All your assigned leads have been called or resolved. Your manager will assign fresh leads shortly."
              : "All your assigned personal leads have been called or resolved. You can assign fresh leads from the Leads Directory."}
          </p>
          {canImport && (
            <button
              type="button"
              onClick={() => setShowImporter(true)}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 shadow-sm transition"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import New CSV Batch</span>
            </button>
          )}
        </div>
      ) : (
        /* 2-Column Responsive Studio Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Smart Dialer Console (7 Columns) */}
          <div className="lg:col-span-7">
            <DialerCard
              lead={lead}
              onDisposed={onDisposed}
            />
          </div>

          {/* Right Column: Live Sales Script & Playbook Assistant (5 Columns) */}
          <div className="lg:col-span-5">
            <SalesScriptAssistant
              lead={lead}
              onOpenWhatsAppModal={() => setShowWAModal(true)}
              sessionCallCount={todayCallsCount}
              dailyCallTarget={dailyCallTarget}
            />
          </div>
        </div>
      )}

      {/* Standalone WhatsApp Modal if triggered from right drawer */}
      {showWAModal && lead && (
        <WhatsAppTemplateModal
          lead={lead}
          onClose={() => setShowWAModal(false)}
        />
      )}

      {/* CSV Importer Modal */}
      {showImporter && (
        <CSVImporter
          onClose={() => setShowImporter(false)}
          onImported={() => {
            setShowImporter(false);
            queryClient.invalidateQueries({ queryKey: ["dialer-queue"] });
            toast.success("Leads imported! Loading first lead...");
          }}
        />
      )}
    </div>
  );
}
