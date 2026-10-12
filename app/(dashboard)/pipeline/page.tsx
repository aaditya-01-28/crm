"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { KanbanSquare, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { DealCard } from "@/components/pipeline/DealCard";
import { DealModal } from "@/components/pipeline/DealModal";
import { PaymentModal } from "@/components/payments/PaymentModal";
import { toast } from "sonner";

const COLUMNS = [
  { id: "demo_scheduled", label: "Demo Scheduled", color: "border-slate-300 bg-slate-50" },
  { id: "demo_done", label: "Demo Done", color: "border-teal-300 bg-teal-50" },
  { id: "quote_sent", label: "Quote Sent", color: "border-amber-300 bg-amber-50" },
  { id: "payment_pending", label: "Payment Pending", color: "border-orange-300 bg-orange-50" },
  { id: "closed_won", label: "Closed Won 🏆", color: "border-emerald-300 bg-emerald-50" },
] as const;

type Stage = (typeof COLUMNS)[number]["id"];

interface Deal {
  id: string;
  stage: Stage;
  serviceType: string;
  quantity: number;
  quotedPrice: string;
  expectedClosingDate: string | null;
  closingNotes: string | null;
  lead: {
    phoneNumber: string;
    contactName: string | null;
    companyName: string | null;
    businessVertical: string | null;
  };
  rep: { fullName: string };
  leadId: string;
}

async function fetchDeals(): Promise<{ deals: Deal[] }> {
  const res = await fetch("/api/deals");
  if (!res.ok) throw new Error("Failed to fetch deals");
  return res.json();
}

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const [showDealModal, setShowDealModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [paymentDeal, setPaymentDeal] = useState<Deal | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["deals"],
    queryFn: fetchDeals,
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      if (data.triggerPaymentModal && data.deal) {
        setPaymentDeal(data.deal);
      }
    },
    onError: () => toast.error("Failed to move deal"),
  });

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStage = destination.droppableId as Stage;
    stageMutation.mutate({ dealId: draggableId, stage: newStage });
  }

  const deals = data?.deals || [];

  // Group deals by stage
  const dealsByStage = COLUMNS.reduce(
    (acc, col) => {
      acc[col.id] = deals.filter((d) => d.stage === col.id);
      return acc;
    },
    {} as Record<Stage, Deal[]>
  );

  // Column aggregations
  function colStats(colId: Stage) {
    const colDeals = dealsByStage[colId];
    const total = colDeals.reduce((sum, d) => sum + Number(d.quotedPrice), 0);
    const credits = colDeals.reduce((sum, d) => sum + d.quantity, 0);
    return { total, credits, count: colDeals.length };
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <KanbanSquare className="w-6 h-6 text-emerald-600" />
            Deal Pipeline
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Drag cards to update deal stages</p>
        </div>
        <button
          onClick={() => {
            setEditingDeal(null);
            setShowDealModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition shadow-xs"
        >
          <Plus className="w-4 h-4" />
          New Deal
        </button>
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
            {COLUMNS.map((col) => {
              const stats = colStats(col.id);
              return (
                <div key={col.id} className="flex flex-col w-72 shrink-0">
                  {/* Column Header */}
                  <div className={`rounded-t-xl border-2 ${col.color} px-4 py-3`}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm text-gray-700">
                        {col.label}
                      </h3>
                      <span className="text-xs bg-white/60 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                        {stats.count}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      <span className="font-semibold text-gray-700">
                        {formatCurrency(stats.total)}
                      </span>
                      {" · "}
                      {stats.credits.toLocaleString("en-IN")} credits
                    </div>
                  </div>

                  {/* Droppable column */}
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 border-2 border-t-0 rounded-b-xl p-2 space-y-2 min-h-[200px] transition-colors ${
                          snapshot.isDraggingOver
                            ? "bg-emerald-50/60 border-emerald-300"
                            : "border-gray-200 bg-gray-50"
                        }`}
                      >
                        {dealsByStage[col.id].map((deal, index) => (
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
                        {dealsByStage[col.id].length === 0 &&
                          !snapshot.isDraggingOver && (
                            <div className="text-center text-xs text-gray-400 py-8">
                              Drop deal here
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
          onClose={() => setShowDealModal(false)}
          onSaved={() => {
            setShowDealModal(false);
            queryClient.invalidateQueries({ queryKey: ["deals"] });
          }}
        />
      )}

      {/* Payment Modal (triggered by drag to payment_pending / closed_won) */}
      {paymentDeal && (
        <PaymentModal
          deal={paymentDeal}
          onClose={() => setPaymentDeal(null)}
          onSaved={() => {
            setPaymentDeal(null);
            queryClient.invalidateQueries({ queryKey: ["deals"] });
            toast.success("Payment submitted for ops verification ✅");
          }}
        />
      )}
    </div>
  );
}
