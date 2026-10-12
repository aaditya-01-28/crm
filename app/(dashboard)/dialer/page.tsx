"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, RefreshCw, PhoneCall } from "lucide-react";
import { DialerCard } from "@/components/dialer/DialerCard";
import { CSVImporter } from "@/components/dialer/CSVImporter";
import { toast } from "sonner";
import { useCanImportLeads } from "@/components/layout/SessionProvider";

interface Lead {
  id: string;
  phoneNumber: string;
  contactName: string | null;
  companyName: string | null;
  businessVertical: string | null;
  serviceType: string | null;
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
  const [showImporter, setShowImporter] = useState(false);
  const canImport = useCanImportLeads();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dialer-queue"],
    queryFn: fetchNextLead,
    refetchOnWindowFocus: false,
  });

  const lead = data?.lead;

  function onDisposed(nextLead: Lead | null) {
    if (nextLead) {
      // Inject next lead directly into cache
      queryClient.setQueryData(["dialer-queue"], { lead: nextLead });
    } else {
      // Queue exhausted
      queryClient.invalidateQueries({ queryKey: ["dialer-queue"] });
      toast.info("🎉 Queue complete! All leads have been worked.");
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <PhoneCall className="w-6 h-6 text-emerald-600" />
            Dialer Console
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Rapid one-click calling & disposition
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {canImport && (
            <button
              onClick={() => setShowImporter(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition font-medium"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Loading next lead...</p>
        </div>
      ) : isError ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <p className="text-red-600 font-medium">Failed to load lead queue</p>
          <button
            onClick={() => refetch()}
            className="mt-3 text-sm text-red-500 underline"
          >
            Try again
          </button>
        </div>
      ) : !lead ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <h3 className="text-lg font-semibold text-gray-700">
            Queue is empty!
          </h3>
          {canImport ? (
            <>
              <p className="text-gray-500 text-sm mt-1">
                All leads have been worked. Import a new batch or browse the Leads Directory.
              </p>
              <button
                onClick={() => setShowImporter(true)}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition mx-auto font-medium"
              >
                <Upload className="w-4 h-4" />
                Import CSV Batch
              </button>
            </>
          ) : (
            <p className="text-gray-500 text-sm mt-1">
              All your assigned leads have been worked. Your manager will assign new leads to you shortly.
            </p>
          )}
        </div>
      ) : (
        <DialerCard lead={lead} onDisposed={onDisposed} />
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
