"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Phone,
  PhoneCall,
  Contact,
  CalendarClock,
  KanbanSquare,
  CreditCard,
  BarChart3,
  Users,
  User,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeRole } from "@/lib/rbac";
import { useQuery } from "@tanstack/react-query";
import { useSidebar } from "./SidebarContext";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["super_admin", "sales_manager", "sales_rep", "accounts_ops"],
  },
  {
    href: "/dialer",
    label: "Dialer",
    icon: Phone,
    roles: ["super_admin", "sales_manager", "sales_rep"],
  },
  {
    href: "/calls",
    label: "Call Logs",
    icon: PhoneCall,
    roles: ["super_admin", "sales_manager", "sales_rep"],
  },
  {
    href: "/leads",
    label: "Leads Directory",
    icon: Contact,
    roles: ["super_admin", "sales_manager", "sales_rep"],
  },
  {
    href: "/agenda",
    label: "Agenda",
    icon: CalendarClock,
    roles: ["super_admin", "sales_manager", "sales_rep"],
  },
  {
    href: "/pipeline",
    label: "Pipeline",
    icon: KanbanSquare,
    roles: ["super_admin", "sales_manager", "sales_rep"],
  },
  {
    href: "/payments",
    label: "Payments",
    icon: CreditCard,
    roles: ["super_admin", "sales_manager", "sales_rep", "accounts_ops"],
  },
  {
    href: "/reports",
    label: "Reports",
    icon: BarChart3,
    roles: ["super_admin", "sales_manager"],
  },
  {
    href: "/team",
    label: "Team",
    icon: Users,
    roles: ["super_admin", "sales_manager"],
  },
  {
    href: "/profile",
    label: "My Profile",
    icon: User,
    roles: ["super_admin", "sales_manager", "sales_rep", "accounts_ops"],
  },
];

interface SidebarProps {
  role: string;
}

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const normalizedRole = normalizeRole(role);
  const { isCollapsed, toggleCollapse, isMobileOpen, closeMobile } = useSidebar();

  const { data: reqData } = useQuery<{ pendingCount: number }>({
    queryKey: ["password-requests-count"],
    queryFn: async () => {
      const res = await fetch("/api/team/password-requests");
      if (!res.ok) return { pendingCount: 0 };
      return res.json();
    },
    enabled: normalizedRole === "super_admin",
    refetchInterval: 20000,
  });

  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(normalizedRole)
  );

  return (
    <>
      {/* ======================================================== */}
      {/* MOBILE BACKDROP & DRAWER (screen < md)                   */}
      {/* ======================================================== */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/70 z-40 backdrop-blur-xs md:hidden transition-opacity"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-slate-950 text-white flex flex-col border-r border-slate-900 shadow-2xl transition-transform duration-300 ease-in-out md:hidden",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Mobile Header */}
        <div className="p-4 border-b border-slate-900 flex items-center justify-between">
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className="flex items-center gap-2.5 group"
          >
            <img
              src="/icon.png"
              alt="Textora"
              className="h-8 w-8 rounded-lg object-contain"
            />
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-white group-hover:text-emerald-400 transition-colors">
                Textora Engage
              </span>
              <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-semibold">
                Enterprise CRM
              </span>
            </div>
          </Link>

          <button
            onClick={closeMobile}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Nav Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            const showTeamBadge =
              item.href === "/team" && (reqData?.pendingCount || 0) > 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group",
                  active
                    ? "bg-emerald-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:bg-slate-900/90 hover:text-white"
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    active
                      ? "text-white"
                      : "text-slate-400 group-hover:text-emerald-400"
                  )}
                />
                <span className="flex-1">{item.label}</span>
                {showTeamBadge && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                    {reqData?.pendingCount}
                  </span>
                )}
                {active && <ChevronRight className="w-4 h-4 opacity-75" />}
              </Link>
            );
          })}
        </nav>

        {/* Mobile Footer */}
        <div className="p-4 border-t border-slate-900 text-xs text-slate-500 flex items-center justify-between">
          <span>Textora Technologies</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
        </div>
      </aside>

      {/* ======================================================== */}
      {/* DESKTOP SIDEBAR (screen >= md)                           */}
      {/* Collapsible between full (w-64) and icon rail (w-20)     */}
      {/* ======================================================== */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 bg-slate-950 text-white border-r border-slate-900 select-none transition-[width] duration-200 ease-in-out relative",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
        {/* Brand Logo Header */}
        <div
          className={cn(
            "border-b border-slate-900/90 flex transition-all",
            isCollapsed
              ? "px-3 py-4 flex-col items-center justify-center gap-2"
              : "px-5 py-4 flex-col gap-1.5"
          )}
        >
          {isCollapsed ? (
            /* Collapsed Mode: Logo Icon is prominently visible for easy navigation */
            <div className="flex flex-col items-center gap-2">
              <Link
                href="/dashboard"
                className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center hover:scale-105 hover:border-emerald-500/50 transition-all shadow-sm"
                title="Textora Engage — Click for Dashboard"
              >
                <img
                  src="/icon.png"
                  alt="Textora Logo"
                  className="w-7 h-7 object-contain"
                />
              </Link>
              <button
                onClick={toggleCollapse}
                className="p-1 rounded-md text-slate-500 hover:text-emerald-400 hover:bg-slate-900 transition text-[10px]"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* Expanded Mode: Full Logo and branding */
            <>
              <div className="flex items-center justify-between">
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 hover:opacity-90 transition"
                  title="Textora Engage — Home"
                >
                  <img
                    src="/logo.png"
                    alt="Textora Technologies"
                    className="h-8 w-auto object-contain"
                  />
                </Link>

                <button
                  onClick={toggleCollapse}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-900 transition"
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium tracking-wide">
                <span className="text-emerald-400 font-semibold uppercase tracking-wider text-[10px]">
                  Textora Engage
                </span>
                <span className="text-slate-500 text-[10px]">v1.0</span>
              </div>
            </>
          )}
        </div>

        {/* Navigation Items */}
        <nav
          className={cn(
            "flex-1 py-4 space-y-1.5 overflow-y-auto scrollbar-none",
            isCollapsed ? "px-2" : "px-3"
          )}
        >
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            const showTeamBadge =
              item.href === "/team" && (reqData?.pendingCount || 0) > 0;

            if (isCollapsed) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center justify-center w-full h-11 rounded-xl transition-all group",
                    active
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-400 hover:bg-slate-900 hover:text-white"
                  )}
                  title={item.label}
                >
                  <Icon
                    className={cn(
                      "w-5 h-5 transition-colors",
                      active
                        ? "text-white"
                        : "text-slate-400 group-hover:text-emerald-400"
                    )}
                  />
                  {showTeamBadge && (
                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-slate-950" />
                  )}
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                  active
                    ? "bg-emerald-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:bg-slate-900/90 hover:text-white"
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    active
                      ? "text-white"
                      : "text-slate-400 group-hover:text-emerald-400"
                  )}
                />
                <span className="flex-1 truncate">{item.label}</span>
                {showTeamBadge && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                    {reqData?.pendingCount}
                  </span>
                )}
                {active && <ChevronRight className="w-3.5 h-3.5 opacity-75" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className={cn(
            "border-t border-slate-900 text-slate-500 transition-all",
            isCollapsed
              ? "p-2 flex flex-col items-center gap-2"
              : "px-4 py-3 flex items-center justify-between text-xs"
          )}
        >
          {isCollapsed ? (
            <button
              onClick={toggleCollapse}
              className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-900 transition"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button
                onClick={toggleCollapse}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
                <span>Collapse</span>
              </button>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Online</span>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
