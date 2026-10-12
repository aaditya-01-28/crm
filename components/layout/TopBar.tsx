"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { toast } from "sonner";
import type { JWTPayload } from "@/lib/auth";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  sales_manager: "Sales Manager",
  sales_rep: "Sales Rep",
  accounts_ops: "Accounts & Ops",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-emerald-100 text-emerald-800 border-emerald-200",
  sales_manager: "bg-teal-100 text-teal-800 border-teal-200",
  sales_rep: "bg-emerald-50 text-emerald-700 border-emerald-200",
  accounts_ops: "bg-amber-100 text-amber-800 border-amber-200",
};

export default function TopBar({ user }: { user: JWTPayload }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Logged out successfully");
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200/80 px-6 flex items-center justify-between shrink-0 shadow-xs">
      {/* Left: Branding badge / live connection */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Textora Enterprise Network
        </span>
      </div>

      {/* Right: user info + profile + logout */}
      <div className="flex items-center gap-3">
        <Link
          href="/profile"
          className="flex items-center gap-2.5 hover:bg-gray-50 px-2 py-1 rounded-xl transition group"
          title="Manage Account & Profile"
        >
          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shadow-emerald-800/20 group-hover:scale-105 transition-transform">
            {user.fullName.charAt(0).toUpperCase()}
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-800 leading-tight group-hover:text-emerald-700 transition-colors">
              {user.fullName}
            </p>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${ROLE_COLORS[user.role] || "bg-gray-100 text-gray-600"}`}
            >
              {ROLE_LABELS[user.role] || user.role}
            </span>
          </div>
        </Link>

        <Link
          href="/profile"
          className="flex items-center gap-1.5 text-gray-500 hover:text-emerald-700 transition text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-gray-100 border border-gray-200"
          title="Account Profile"
        >
          <User className="w-3.5 h-3.5 text-emerald-600" />
          <span className="hidden md:inline">Profile</span>
        </Link>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-gray-400 hover:text-red-600 transition text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-red-50"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
