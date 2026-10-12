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

const COLOR_STYLES = {
  emerald: {
    bg: "bg-emerald-50 text-emerald-700 border-emerald-100",
    iconBg: "bg-emerald-500/10 text-emerald-600",
    accent: "from-emerald-500/10 to-transparent",
  },
  blue: {
    bg: "bg-blue-50 text-blue-700 border-blue-100",
    iconBg: "bg-blue-500/10 text-blue-600",
    accent: "from-blue-500/10 to-transparent",
  },
  indigo: {
    bg: "bg-indigo-50 text-indigo-700 border-indigo-100",
    iconBg: "bg-indigo-500/10 text-indigo-600",
    accent: "from-indigo-500/10 to-transparent",
  },
  amber: {
    bg: "bg-amber-50 text-amber-700 border-amber-100",
    iconBg: "bg-amber-500/10 text-amber-600",
    accent: "from-amber-500/10 to-transparent",
  },
  purple: {
    bg: "bg-purple-50 text-purple-700 border-purple-100",
    iconBg: "bg-purple-500/10 text-purple-600",
    accent: "from-purple-500/10 to-transparent",
  },
  rose: {
    bg: "bg-rose-50 text-rose-700 border-rose-100",
    iconBg: "bg-rose-500/10 text-rose-600",
    accent: "from-rose-500/10 to-transparent",
  },
  teal: {
    bg: "bg-teal-50 text-teal-700 border-teal-100",
    iconBg: "bg-teal-500/10 text-teal-600",
    accent: "from-teal-500/10 to-transparent",
  },
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
  const styles = COLOR_STYLES[color] || COLOR_STYLES.emerald;

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs transition duration-200 hover:shadow-md relative overflow-hidden",
        onClick && "cursor-pointer hover:border-gray-300"
      )}
    >
      {/* Subtle gradient glow in top corner */}
      <div
        className={cn(
          "absolute -right-8 -top-8 w-24 h-24 bg-gradient-to-br rounded-full pointer-events-none",
          styles.accent
        )}
      />

      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
            {label}
          </p>
          <h3 className="text-2xl font-bold tracking-tight text-gray-900">
            {value}
          </h3>
          {subValue && (
            <p className="text-xs font-medium text-gray-500 mt-1 flex items-center gap-1">
              {subValue}
            </p>
          )}
        </div>

        <div className={cn("p-2.5 rounded-xl border border-transparent", styles.iconBg)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {badge && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span className="font-medium text-gray-600">{badge}</span>
        </div>
      )}
    </div>
  );
}
