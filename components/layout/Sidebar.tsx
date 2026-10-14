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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeRole } from "@/lib/rbac";
import { useQuery } from "@tanstack/react-query";

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
    <aside className="w-64 bg-slate-950 text-white flex flex-col shrink-0 border-r border-slate-900 select-none">
      {/* Brand Logo Header */}
      <div className="px-5 py-4 border-b border-slate-900 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="Textora Technologies"
            className="h-8 w-auto object-contain"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium tracking-wide">
          <span className="text-emerald-400 font-semibold uppercase tracking-wider">Textora Engage</span>
          <span className="text-slate-500">v1.0</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          const showTeamBadge = item.href === "/team" && (reqData?.pendingCount || 0) > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                active
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/50 font-semibold"
                  : "text-slate-400 hover:bg-slate-900/90 hover:text-white"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  active ? "text-white" : "text-slate-400 group-hover:text-emerald-400"
                )}
              />
              <span className="flex-1">{item.label}</span>
              {showTeamBadge && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse">
                  {reqData?.pendingCount}
                </span>
              )}
              {active && <ChevronRight className="w-3.5 h-3.5 opacity-80" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-900 text-xs text-slate-500 flex items-center justify-between">
        <span>Textora Technologies</span>
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="System Online" />
      </div>
    </aside>
  );
}
