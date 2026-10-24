"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { KanbanSquare, Plus, RefreshCw, Trophy, XCircle, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { DealCard } from "@/components/pipeline/DealCard";
import { DealModal } from "@/components/pipeline/DealModal";
import { PaymentModal } from "@/components/payments/PaymentModal";
import { useIsManagerOrAdmin } from "@/components/layout/SessionProvider";
import { toast } from "sonner";

const COLUMNS = [
  {
    id: "demo_scheduled",
    label: "Demo Scheduled",
    badgeColor: "bg-slate-100 text-slate-700",
    headerBg: "bg-slate-50/80 border-slate-200",
    headerAccent: "border-slate-400",
  },
  {
    id: "demo_done",
    label: "Demo Done",
    badgeColor: "bg-sky-100 text-sky-800",
    headerBg: "bg-sky-50/70 border-sky-200",
    headerAccent: "border-sky-400",
  },
  {
    id: "quote_sent",
    label: "Quote Sent",
    badgeColor: "bg-amber-100 text-amber-800",
    headerBg: "bg-amber-50/70 border-amber-200",
    headerAccent: "border-amber-400",
  },
  {
    id: "payment_pending",
    label: "Payment Pending",
    badgeColor: "bg-orange-100 text-orange-800",
    headerBg: "bg-orange-50/70 border-orange-200",
    headerAccent: "border-orange-400",
  },
  {
    id: "closed_won",
    label: "Closed Won",
    badgeColor: "bg-emerald-100 text-emerald-800",
    headerBg: "bg-emerald-50/70 border-emerald-200",
    headerAccent: "border-emerald-500",
  },
  {
    id: "closed_lost",
    label: "Closed Lost",
    badgeColor: "bg-rose-100 text-rose-800",
    headerBg: "bg-rose-50/70 border-rose-200",
    headerAccent: "border-rose-400",
  },
] as const;

type Stage = (typeof COLUMNS)[number]["id"];

interface Deal {
  id: string;
  stage: string;
  serviceType: string;
  quantity: number;
  quotedPrice: string;
  expectedClosingDate: string | null;
  closingNotes: string | null;
  lead: {
    phoneNumber: string;
    contactName: string | null;
    companyName: string | null;
    businessVertical?: string | null;
    customMetadata?: {
      address?: string;
      [key: string]: any;
    } | null;
  };
  rep?: { fullName: string } | null;
  leadId: string;
}

async function fetchDeals(): Promise<{ deals: Deal[] }> {
  const res = await fetch("/api/deals");
  if (!res.ok) throw new Error("Failed to fetch deals");
  return res.json();
}

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const canManageDeals = useIsManagerOrAdmin();
  const [showDealModal, setShowDealModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [paymentDeal, setPaymentDeal] = useState<Deal | null>(null);
  const [dealToDelete, setDealToDelete] = useState<Deal | null>(null);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["deals"],
    queryFn: fetchDeals,
  });

  const deleteMutation = useMutation({
    mutationFn: async (dealId: string) => {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete deal");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["leads-directory"] });
      toast.success("Deal deleted from pipeline ✅");
      setDealToDelete(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete deal");
    },
  });

  const stageMutation = useMutation({
    mutationFn: async ({ dealId, stage }: { dealId: string; stage: string }) => {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error("Failed to update stage");
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["leads-directory"] });
      
      if (variables.stage === "closed_won") {
        toast.success("Deal moved to Closed Won");
      } else if (variables.stage === "closed_lost") {
        toast.info("Deal moved to Closed Lost");
      } else {
        toast.success("Deal stage updated");
      }

      if (data.triggerPaymentModal && data.deal) {
        setPaymentDeal(data.deal);
      }
    },
    onError: () => toast.error("Failed to move deal"),
  });

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const { draggableId, destination, source } = result;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }
    const newStage = destination.droppableId as Stage;
    stageMutation.mutate({ dealId: draggableId, stage: newStage });
  }

  const deals = data?.deals || [];

  // Group deals by stage with stage normalization
  const dealsByStage = COLUMNS.reduce(
    (acc, col) => {
      acc[col.id] = deals.filter((d) => {
        if (col.id === "closed_won") {
          return d.stage === "closed_won" || d.stage === "won";
        }
        if (col.id === "closed_lost") {
          return d.stage === "closed_lost" || d.stage === "lost";
        }
        return d.stage === col.id;
      });
      return acc;
    },
    {} as Record<Stage, Deal[]>
  );

  // Column statistics aggregations
  function colStats(colId: Stage) {
    const colDeals = dealsByStage[colId] || [];
    const total = colDeals.reduce(
      (sum, d) => sum + (parseFloat(d.quotedPrice) || 0),
      0
    );
    const credits = colDeals.reduce(
      (sum, d) => sum + (Number(d.quantity) || 0),
      0
    );
    return { total, credits, count: colDeals.length };
  }

  // Board total statistics
  const totalPipelineDeals = deals.length;
  const totalPipelineValue = deals.reduce(
    (sum, d) => sum + (parseFloat(d.quotedPrice) || 0),
    0
  );

  return (
    <div className="h-full flex flex-col min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <KanbanSquare className="w-6 h-6 text-emerald-600" />
            Commercial Deal Pipeline
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage active client pipelines, track deals, and drag cards across stages.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs"
            title="Refresh Pipeline"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin text-emerald-600" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => {
              setEditingDeal(null);
              setShowDealModal(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-emerald-700 transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New Deal</span>
          </button>
        </div>
      </div>

      {/* Board summary ribbon */}
      <div className="mb-4 bg-white border border-slate-200/80 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-slate-600 shadow-2xs shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <span className="text-slate-400">Total Deals: </span>
            <strong className="text-slate-900 font-bold">{totalPipelineDeals}</strong>
          </div>
          <div className="hidden sm:block text-slate-300">|</div>
          <div>
            <span className="text-slate-400">Active Bookings Value: </span>
            <strong className="text-emerald-700 font-bold">
              {formatCurrency(totalPipelineValue)}
            </strong>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5 text-emerald-600" />
            Won: <strong>{colStats("closed_won").count}</strong>
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
            Lost: <strong>{colStats("closed_lost").count}</strong>
          </span>
        </div>
      </div>

      {/* Board Columns Container */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 flex-1 scrollbar-thin">
            {COLUMNS.map((col) => {
              const stats = colStats(col.id);
              const columnDeals = dealsByStage[col.id] || [];

              return (
                <div key={col.id} className="flex flex-col w-72 shrink-0">
                  {/* Column Header */}
                  <div
                    className={`rounded-t-xl border border-b-0 ${col.headerBg} px-3.5 py-3 border-t-2 ${col.headerAccent}`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-xs uppercase tracking-wide text-slate-700">
                        {col.label}
                      </h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold ${col.badgeColor}`}
                      >
                        {stats.count}
                      </span>
                    </div>

                    <div className="mt-1.5 text-[11px] text-slate-500 flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        {formatCurrency(stats.total)}
                      </span>
                      <span>
                        {stats.credits.toLocaleString("en-IN")} units
                      </span>
                    </div>
                  </div>

                  {/* Droppable Column Body */}
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 border rounded-b-xl p-2 space-y-2.5 min-h-[260px] transition-colors ${
                          snapshot.isDraggingOver
                            ? "bg-emerald-50/50 border-emerald-300 ring-2 ring-emerald-500/20"
                            : "border-slate-200 bg-slate-50/60"
                        }`}
                      >
                        {columnDeals.map((deal, index) => (
                          <Draggable
                            key={deal.id}
                            draggableId={deal.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                              >
                                <DealCard
                                  deal={deal}
                                  isDragging={snapshot.isDragging}
                                  canEdit={canManageDeals}
                                  canDelete={canManageDeals}
                                  onDelete={() => setDealToDelete(deal)}
                                  onClick={() => {
                                    setEditingDeal(deal);
                                    setShowDealModal(true);
                                  }}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}

                        {columnDeals.length === 0 && !snapshot.isDraggingOver && (
                          <div className="text-center text-xs text-slate-400 py-10 border border-dashed border-slate-200 rounded-lg">
                            No deals in this stage
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Deal Modal */}
      {showDealModal && (
        <DealModal
          deal={editingDeal}
          canEdit={canManageDeals}
          canDelete={canManageDeals}
          onClose={() => setShowDealModal(false)}
          onSaved={() => {
            setShowDealModal(false);
            queryClient.invalidateQueries({ queryKey: ["deals"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
            queryClient.invalidateQueries({ queryKey: ["leads-directory"] });
          }}
        />
      )}

      {/* Quick Delete Confirmation Dialog from Card */}
      {dealToDelete && (
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
                  Are you sure you want to delete the deal for{" "}
                  <strong>
                    {dealToDelete.lead?.companyName ||
                      dealToDelete.lead?.contactName ||
                      "this customer"}
                  </strong>{" "}
                  ({formatCurrency(Number(dealToDelete.quotedPrice || 0))})?
                  This action is permanent and will remove it from the pipeline metrics.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDealToDelete(null)}
                disabled={deleteMutation.isPending}
                className="px-3.5 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(dealToDelete.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-xs transition"
              >
                {deleteMutation.isPending ? (
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

      {/* Payment Modal (triggered when deal moves to closed_won or payment_pending) */}
      {paymentDeal && (
        <PaymentModal
          deal={paymentDeal}
          onClose={() => setPaymentDeal(null)}
          onSaved={() => {
            setPaymentDeal(null);
            queryClient.invalidateQueries({ queryKey: ["deals"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
            toast.success("Payment submitted for ops verification");
          }}
        />
      )}
    </div>
  );
}
