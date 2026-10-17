"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { toast } from "sonner";
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

export default function TopBar({ user }: { user: JWTPayload }) {
  const router = useRouter();
  const { toggleMobile, isCollapsed, toggleCollapse } = useSidebar();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Logged out successfully");
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200/80 px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-2xs">
      {/* Left: Mobile hamburger + Desktop toggle + Branding badge */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Mobile menu trigger */}
        <button
          onClick={toggleMobile}
          className="md:hidden p-1.5 -ml-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
          aria-label="Open sidebar navigation"
          title="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Desktop sidebar toggle button */}
        <button
          onClick={toggleCollapse}
          className="hidden md:flex p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-4 h-4 text-emerald-600" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>

        <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="hidden sm:inline">Textora Enterprise Network</span>
          <span className="sm:hidden">Textora</span>
        </span>
      </div>

      {/* Right: user info + profile + logout */}
      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/profile"
          className="flex items-center gap-2 hover:bg-gray-50 px-2 py-1 rounded-xl transition group"
          title="Manage Account & Profile"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs group-hover:scale-105 transition-transform">
            {user.fullName.charAt(0).toUpperCase()}
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-800 leading-tight group-hover:text-emerald-700 transition-colors">
              {user.fullName}
            </p>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-medium border ${
                ROLE_COLORS[user.role] || "bg-gray-100 text-gray-600"
              }`}
            >
              {ROLE_LABELS[user.role] || user.role}
            </span>
          </div>
        </Link>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-gray-400 hover:text-rose-600 transition text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-rose-50"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
