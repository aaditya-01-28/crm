"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu, Smartphone, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { JWTPayload } from "@/lib/auth";
import { useSidebar } from "./SidebarContext";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  sales_manager: "Sales Manager",
  sales_rep: "Sales Rep",
  accounts_ops: "Accounts & Ops",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-emerald-50 text-emerald-800 border-emerald-200",
  sales_manager: "bg-teal-50 text-teal-800 border-teal-200",
  sales_rep: "bg-emerald-50 text-emerald-700 border-emerald-200",
  accounts_ops: "bg-amber-50 text-amber-800 border-amber-200",
};

function formatLastLogin(dateStr?: string | null): { display: string; full: string } {
  if (!dateStr) {
    return { display: "Active Session", full: "Current session active (9-hr window)" };
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return { display: "Active Session", full: "Current session active (9-hr window)" };
    }
    const datePart = d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
    const timePart = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const full = d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    return {
      display: `${datePart}, ${timePart}`,
      full,
    };
  } catch {
    return { display: "Active Session", full: "Current session active (9-hr window)" };
  }
}

export default function TopBar({ user }: { user: JWTPayload }) {
  const router = useRouter();
  const { toggleMobile } = useSidebar();
  const [repStatus, setRepStatus] = useState<"available" | "in_call" | "break" | "wrapup">("available");
  const lastLoginTimestamp = user.lastLoginAt || user.loginAt;
  const lastLoginInfo = formatLastLogin(lastLoginTimestamp);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Logged out successfully");
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200/80 px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-2xs">
      {/* Left: Mobile menu trigger + Executive Product Branding */}
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <button
          onClick={toggleMobile}
          className="md:hidden p-1.5 -ml-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
          aria-label="Open sidebar navigation"
          title="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Product Identity & Platform Branding */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 flex items-center gap-1">
              <span>TEXTORA</span>
              <span className="text-emerald-600 font-bold">ENGAGE</span>
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 ml-0.5">
                PRO
              </span>
            </span>
          </div>

          <div className="hidden lg:block h-4 w-px bg-slate-200" />

          {/* Product Suite Tagline */}
          <span className="hidden lg:inline-flex text-[11px] font-medium text-slate-500 items-center gap-1.5">
            Cloud Telephony & Omnichannel Sales CRM
          </span>

          <div className="hidden sm:block h-4 w-px bg-slate-200" />

          {/* Operational Status Pill */}
          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden sm:inline">Enterprise Network • Live</span>
            <span className="sm:hidden">Live</span>
          </span>
        </div>
      </div>

      {/* Right: rep status + user info + profile + logout */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Representative Calling Availability Dropdown */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-2xs">
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              repStatus === "available"
                ? "bg-emerald-500 animate-pulse"
                : repStatus === "in_call"
                ? "bg-blue-500 animate-pulse"
                : repStatus === "break"
                ? "bg-amber-500"
                : "bg-purple-500"
            )}
          />
          <select
            value={repStatus}
            onChange={(e) => {
              const newStatus = e.target.value as any;
              setRepStatus(newStatus);
              toast.info(`Status updated to: ${newStatus.toUpperCase()}`);
            }}
            className="bg-transparent outline-none cursor-pointer text-xs font-semibold text-slate-800"
          >
            <option value="available">Ready to Call</option>
            <option value="in_call">In Live Call</option>
            <option value="wrapup">Call Wrap-up</option>
            <option value="break">Short Break</option>
          </select>
        </div>
        {/* Last Login Timestamp Badge */}
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs shadow-2xs hover:bg-slate-100/70 transition-colors"
          title={`Last login recorded: ${lastLoginInfo.full} • Session token valid for 9 hours`}
        >
          <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="text-slate-500 font-medium text-[11px] sm:text-xs">Last Login:</span>
          <span className="font-semibold text-slate-800 font-mono text-[11px] sm:text-xs">
            {lastLoginInfo.display}
          </span>
        </div>

        <Link
          href="/profile"
          className="flex items-center gap-2 hover:bg-gray-50 px-2 py-1 rounded-xl transition group"
          title="Manage Account & Profile"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs group-hover:scale-105 transition-transform overflow-hidden shrink-0">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.fullName} className="w-full h-full object-cover" />
            ) : (
              user.fullName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-800 leading-tight group-hover:text-emerald-700 transition-colors">
              {user.fullName}
            </p>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-medium border ${
                  ROLE_COLORS[user.role] || "bg-gray-100 text-gray-600"
                }`}
              >
                {ROLE_LABELS[user.role] || user.role}
              </span>
              <span className="text-[10px] text-slate-400 font-mono md:hidden" title={`Last login: ${lastLoginInfo.full}`}>
                • {lastLoginInfo.display}
              </span>
            </div>
          </div>
        </Link>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-gray-400 hover:text-rose-600 transition text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-rose-50 cursor-pointer"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
