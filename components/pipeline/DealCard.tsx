"use client";

import { formatCurrency, cn } from "@/lib/utils";
import { Calendar, Tag } from "lucide-react";

interface DealCardProps {
  deal: {
    id: string;
    serviceType: string;
    quantity: number;
    quotedPrice: string;
    expectedClosingDate: string | null;
    lead: {
      phoneNumber?: string;
      companyName: string | null;
      contactName: string | null;
      businessVertical: string | null;
    };
    rep: { fullName: string };
  };
  isDragging?: boolean;
  onClick: () => void;
}

export function DealCard({ deal, isDragging, onClick }: DealCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-xl border border-gray-200 p-3.5 cursor-pointer hover:shadow-md transition-shadow select-none",
        isDragging && "shadow-xl rotate-1 border-blue-300"
      )}
    >
      {/* Company / Contact */}
      <p className="font-semibold text-sm text-gray-800 leading-tight truncate">
        {deal.lead.companyName || deal.lead.contactName || deal.lead.phoneNumber || "Direct Contact"}
      </p>
      {deal.lead.contactName && (
        <p className="text-xs text-gray-500 mt-0.5 truncate">
          {deal.lead.contactName}
        </p>
      )}

      {/* Service & Vertical */}
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {deal.lead.businessVertical && (
          <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
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
                  className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5"
                >
                  <Tag className="w-2.5 h-2.5 text-gray-500" />
                  {st}
                </span>
              ))
          : null}
      </div>

      {/* Financials */}
      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className="text-base font-bold text-green-700">
            {formatCurrency(Number(deal.quotedPrice))}
          </p>
          <p className="text-xs text-gray-400">
            {deal.quantity.toLocaleString("en-IN")} credits
          </p>
        </div>
        {deal.expectedClosingDate && (
          <div className="text-right">
            <p className="text-xs text-gray-400 flex items-center gap-0.5 justify-end">
              <Calendar className="w-3 h-3" />
              Close by
            </p>
            <p className="text-xs font-medium text-gray-600">
              {new Date(deal.expectedClosingDate).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
              })}
            </p>
          </div>
        )}
      </div>

      {/* Rep */}
      <p className="text-xs text-gray-400 mt-2 border-t border-gray-100 pt-2">
        👤 {deal.rep.fullName}
      </p>
    </div>
  );
}
