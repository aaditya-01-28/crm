import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon: LucideIcon;
  color?: "emerald" | "blue" | "indigo" | "amber" | "purple" | "rose" | "teal";
  badge?: string;
  onClick?: () => void;
}

const ICON_ACCENTS: Record<NonNullable<KpiCardProps["color"]>, string> = {
  emerald: "bg-emerald-50 text-emerald-700",
  blue: "bg-gray-100 text-gray-600",
  indigo: "bg-gray-100 text-gray-600",
  amber: "bg-amber-50 text-amber-700",
  purple: "bg-gray-100 text-gray-600",
  rose: "bg-red-50 text-red-700",
  teal: "bg-gray-100 text-gray-600",
};

export function KpiCard({
  label,
  value,
  subValue,
  icon: Icon,
  color = "emerald",
  badge,
  onClick,
}: KpiCardProps) {
  const iconStyle = ICON_ACCENTS[color] || ICON_ACCENTS.emerald;

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-xl border border-gray-200/80 p-5 shadow-xs transition-colors duration-150",
        onClick && "cursor-pointer hover:border-gray-300"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 mb-1.5">
            {label}
          </p>
          <h3 className="text-2xl font-medium tracking-tight text-gray-900 tabular-nums leading-none">
            {value}
          </h3>
          {subValue && (
            <p className="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
              {subValue}
            </p>
          )}
        </div>

        <div className={cn("p-2 rounded-lg shrink-0", iconStyle)}>
          <Icon className="w-4 h-4" strokeWidth={1.5} />
        </div>
      </div>

      {badge && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 tabular-nums">
          <span className="font-medium text-gray-600">{badge}</span>
        </div>
      )}
    </div>
  );
}
