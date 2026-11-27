"use client";

import { formatCurrency, cn, getDealDisplayAmount, extractWonDateFromNotes, parseDealDateToTimestamp } from "@/lib/utils";
import { Calendar, Tag, User, Trash2, Edit3 } from "lucide-react";

interface DealCardProps {
  deal: {
    id: string;
    stage?: string;
    repId?: string | null;
    serviceType: string;
    quantity: number;
    quotedPrice: string;
    closingNotes?: string | null;
    closedAt?: string | null;
    expectedClosingDate: string | null;
    payment?: {
      finalAmount?: string | null;
      createdAt?: string | null;
    } | null;
    splits?: {
      repId: string;
      repName?: string;
      percentage: number;
      isPrimary: boolean;
      status: string;
    }[];
    lead?: {
      phoneNumber?: string;
      companyName: string | null;
      contactName: string | null;
      businessVertical?: string | null;
    } | null;
    rep?: { fullName: string } | null;
  };
  activeRepFilter?: string;
  isDragging?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onDelete?: (dealId: string) => void;
  onClick: () => void;
}

export function DealCard({
  deal,
  activeRepFilter,
  isDragging,
  canEdit,
  canDelete,
  onDelete,
  onClick,
}: DealCardProps) {
  const companyTitle =
    deal.lead?.companyName ||
    deal.lead?.contactName ||
    deal.lead?.phoneNumber ||
    "Direct Deal";

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative bg-white rounded-xl border border-slate-200/90 p-3.5 cursor-pointer hover:border-slate-300 hover:shadow-xs transition-all select-none space-y-2.5",
        isDragging && "shadow-xl rotate-1 border-emerald-400 bg-white ring-2 ring-emerald-500/20"
      )}
    >
      {/* Top action row: Company title & Level 2/3 quick actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-slate-800 leading-snug truncate">
            {companyTitle}
          </p>
          {deal.lead?.contactName && deal.lead?.companyName && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {deal.lead.contactName}
            </p>
          )}
        </div>

        {/* Level 2 & Level 3 Quick Actions on hover */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {canEdit && (
            <span
              className="p-1 rounded text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition"
              title="Edit Deal (Level 2/3)"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </span>
          )}
          {canDelete && onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(deal.id);
              }}
              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
              title="Delete Deal (Level 2/3)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Service Tags & Vertical */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {deal.lead?.businessVertical && (
          <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium">
            {deal.lead.businessVertical}
          </span>
        )}
        {deal.serviceType
          ? deal.serviceType
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((st) => (
                <span
                  key={st}
                  className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200/60 px-2 py-0.5 rounded-md font-medium flex items-center gap-1"
                >
                  <Tag className="w-2.5 h-2.5 text-emerald-600" />
                  {st}
                </span>
              ))
          : null}
      </div>

      {/* Financials & Closing Date */}
      {(() => {
        const fullAmount = getDealDisplayAmount(deal);
        const splits = deal.splits || [];
        const hasSplit = splits.length >= 2;
        const isApprovedSplit = hasSplit && splits.some((s) => s.status === "approved");
        const scopedSplit =
          isApprovedSplit && activeRepFilter && activeRepFilter !== "all"
            ? splits.find((s) => s.repId === activeRepFilter)
            : null;
        const displayAmount = scopedSplit
          ? (fullAmount * scopedSplit.percentage) / 100
          : fullAmount;

        return (
          <>
            {hasSplit && (
              <div className="flex flex-wrap items-center gap-1">
                <span
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-bold border",
                    isApprovedSplit
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                      : "bg-amber-50 text-amber-800 border-amber-200"
                  )}
                >
                  {scopedSplit
                    ? `Split ${scopedSplit.percentage}%`
                    : `Split ${splits.map((s) => `${s.percentage}%`).join(" / ")}`}
                  {!isApprovedSplit ? " (Pending)" : ""}
                </span>
                <span className="text-[10px] text-slate-500 truncate">
                  {splits.map((s) => s.repName?.split(" ")[0] || "Rep").join(" + ")}
                </span>
              </div>
            )}
            <div className="pt-1 flex items-baseline justify-between border-t border-slate-100">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {formatCurrency(displayAmount)}
                </p>
                {scopedSplit && (
                  <p className="text-[10px] text-indigo-600 font-medium">
                    of {formatCurrency(fullAmount)} total
                  </p>
                )}
                <p className="text-[11px] text-slate-400 font-medium">
                  {(deal.quantity || 0).toLocaleString("en-IN")} units
                </p>
              </div>

              {(() => {
                const isClosedWon = deal.stage === "closed_won" || deal.stage === "won";
                const wonDate = extractWonDateFromNotes(deal.closingNotes);
                const displayDate = isClosedWon
                  ? (parseDealDateToTimestamp(wonDate) ||
                      parseDealDateToTimestamp(deal.closedAt) ||
                      parseDealDateToTimestamp(deal.expectedClosingDate))
                  : parseDealDateToTimestamp(deal.expectedClosingDate);
                if (!displayDate) return null;
                return (
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1 justify-end">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {isClosedWon ? "Closed" : "Target"}
                    </p>
                    <p className="text-xs font-semibold text-slate-700">
                      {displayDate.toLocaleDateString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        day: "2-digit",
                        month: "short",
                      })}
                    </p>
                  </div>
                );
              })()}
            </div>
          </>
        );
      })()}

      {/* Rep info footer */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100/80">
        <span className="flex items-center gap-1.5 truncate">
          <User className="w-3 h-3 text-slate-400" />
          <span className="truncate">{deal.rep?.fullName || "Assigned Rep"}</span>
        </span>
      </div>
    </div>
  );
}
