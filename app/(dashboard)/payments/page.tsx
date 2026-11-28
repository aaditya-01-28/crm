"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, CheckCircle2, XCircle, Clock, ExternalLink, User } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { useIsManagerOrAdmin, useSession } from "@/components/layout/SessionProvider";
import { can } from "@/lib/rbac";
import { sanitizeExternalUrl } from "@/lib/url-safety";
import { toast } from "sonner";

interface Payment {
  id: string;
  panelUserId: string;
  creditsToAdd: number;
  originalAmount: string;
  taxAmount: string;
  tdsAmount: string;
  finalAmount: string;
  paymentMode: string;
  gstin: string | null;
  screenshotUrl: string;
  opsApprovalStatus: string;
  creditsProvisioned: boolean;
  createdAt: string;
  userType: string;
  deal: { serviceType: string; quotedPrice: string };
  lead: { contactName: string | null; companyName: string | null; phoneNumber: string };
  rep: { fullName: string; email: string };
  approver: { fullName: string } | null;
  splits?: Array<{
    repId: string;
    repName?: string;
    percentage: number;
    isPrimary: boolean;
    status: string;
  }>;
}

async function fetchPayments(status: string, repId?: string): Promise<{ payments: Payment[] }> {
  let url = `/api/payments?status=${status}`;
  if (repId && repId !== "all") {
    url += `&repId=${encodeURIComponent(repId)}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch payments");
  return res.json();
}

const STATUS_CONFIG = {
  pending_verification: { label: "Pending Verification", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  approved: { label: "Approved", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700", icon: XCircle },
};

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const canManagePayments = useIsManagerOrAdmin();
  const { role } = useSession();
  const canApproveReject = can(role, "payments:approve");
  const [activeTab, setActiveTab] = useState("pending_verification");
  const [repFilter, setRepFilter] = useState("all");

  // Fetch Team members for Manager & Admin rep filter
  const { data: teamData } = useQuery({
    queryKey: ["team-list"],
    queryFn: async () => {
      const res = await fetch("/api/team");
      if (!res.ok) return { users: [] };
      return res.json();
    },
    enabled: canManagePayments,
  });

  const repOptions = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    if (teamData?.users && Array.isArray(teamData.users)) {
      teamData.users.forEach((u: any) => {
        if (u.id && !seen.has(u.id)) {
          seen.add(u.id);
          const roleLabel = u.role === "sales_rep" ? "Rep" : u.role === "sales_manager" ? "Manager" : "Admin";
          list.push({ id: u.id, name: `${u.fullName || u.name || u.email} (${roleLabel})` });
        }
      });
    }
    return list;
  }, [teamData]);

  const { data, isLoading } = useQuery({
    queryKey: ["payments", activeTab, repFilter],
    queryFn: () => fetchPayments(activeTab, repFilter),
  });

  const approveMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "approved" | "rejected";
    }) => {
      const res = await fetch(`/api/payments/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update payment");
      return res.json();
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.status === "approved"
          ? "Payment approved — credits provisioned ✅"
          : "Payment rejected"
      );
      // Invalidate all payment tabs to prevent stale approved/rejected cross-tab bleed
      queryClient.invalidateQueries({ queryKey: ["payments"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
    onError: () => toast.error("Failed to update payment status"),
  });

  const payments = data?.payments || [];

  const tabs = [
    { key: "pending_verification", label: "Pending", count: payments.length },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-emerald-600" />
          Payment Collections
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Ops verification queue — review receipts and provision credits
        </p>
      </div>

      {/* Controls: Tabs & Member Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeTab === tab.key
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
              {tab.key === "pending_verification" && payments.length > 0 && activeTab === "pending_verification" && (
                <span className="ml-2 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {payments.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Member Filter (Level 2 & Level 3 only) */}
        {canManagePayments && (
          <div className="relative min-w-[200px]">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-emerald-600">
              <User className="w-3.5 h-3.5" />
            </div>
            <select
              value={repFilter}
              onChange={(e) => setRepFilter(e.target.value)}
              className="w-full pl-8 pr-7 py-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-1.5 focus:ring-emerald-500 shadow-2xs transition cursor-pointer appearance-none"
            >
              <option value="all">All Team Members</option>
              {repOptions.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-gray-400 text-[10px]">
              ▼
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No payments in this queue</p>
        </div>
      ) : (
        <div className="space-y-4">
          {payments.map((payment) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              onApprove={(id) => approveMutation.mutate({ id, status: "approved" })}
              onReject={(id) => approveMutation.mutate({ id, status: "rejected" })}
              isPending={approveMutation.isPending}
              canApproveReject={canApproveReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentRow({
  payment,
  onApprove,
  onReject,
  isPending,
  canApproveReject,
}: {
  payment: Payment;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isPending: boolean;
  canApproveReject: boolean;
}) {
  const [showImg, setShowImg] = useState(false);
  const StatusConfig = STATUS_CONFIG[payment.opsApprovalStatus as keyof typeof STATUS_CONFIG];
  const StatusIcon = StatusConfig?.icon || Clock;
  const safeScreenshotUrl = sanitizeExternalUrl(payment.screenshotUrl, { allowRelative: true });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start gap-4">
        {/* Screenshot thumbnail */}
        <div className="shrink-0">
          {safeScreenshotUrl ? (
            <button
              onClick={() => setShowImg(true)}
              className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center hover:opacity-80 transition"
            >
              <img
                src={safeScreenshotUrl}
                alt="Receipt"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </button>
          ) : (
            <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-[10px] text-gray-400">
              No Image
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-800 text-sm">
                {payment.lead.companyName || payment.lead.phoneNumber}
              </p>
              <p className="text-xs text-gray-500">
                {payment.rep.fullName} · {formatDateTime(payment.createdAt)}
              </p>
            </div>
            <span
              className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${StatusConfig?.color || "bg-gray-100 text-gray-600"}`}
            >
              <StatusIcon className="w-3 h-3" />
              {StatusConfig?.label}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <Detail label="Panel User ID" value={payment.panelUserId} mono />
            <Detail label="Credits" value={payment.creditsToAdd.toLocaleString("en-IN")} />
            <Detail label="Base Amount" value={formatCurrency(Number(payment.originalAmount))} />
            <Detail label="GST (18%)" value={formatCurrency(Number(payment.taxAmount))} />
            {Number(payment.tdsAmount) > 0 && (
              <Detail label="TDS" value={`-${formatCurrency(Number(payment.tdsAmount))}`} />
            )}
            <Detail label="Final Amount" value={formatCurrency(Number(payment.finalAmount))} bold />
            <Detail label="Mode" value={payment.paymentMode} />
            <Detail label="User Type" value={payment.userType.replace("_", " ")} />
            {payment.gstin && <Detail label="GSTIN" value={payment.gstin} mono />}
          </div>

          {payment.splits && payment.splits.length >= 2 && (
            <div className="mt-2.5 bg-indigo-50/80 border border-indigo-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2 text-[11px] text-indigo-900">
              <span className="font-bold">Split Deal Attribution:</span>
              {payment.splits.map((sp, i) => (
                <span
                  key={`${sp.repId}-${i}`}
                  className="bg-white border border-indigo-200 px-2 py-0.5 rounded-md font-semibold"
                >
                  {sp.repName || "Rep"} ({sp.percentage}%):{" "}
                  <span className="font-mono text-emerald-700">
                    {formatCurrency((Number(payment.finalAmount || 0) * sp.percentage) / 100)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons for pending */}
      {(payment.opsApprovalStatus === "pending_verification" || payment.opsApprovalStatus === "pending") && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 justify-end items-center">
          {safeScreenshotUrl && (
            <a
              href={safeScreenshotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Receipt
            </a>
          )}
          {canApproveReject ? (
            <>
              <button
                onClick={() => onReject(payment.id)}
                disabled={isPending}
                className="flex items-center gap-1 text-xs text-red-600 border border-red-200 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject
              </button>
              <button
                onClick={() => onApprove(payment.id)}
                disabled={isPending}
                className="flex items-center gap-1 text-xs text-green-700 border border-green-200 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approve &amp; Add Credits
              </button>
            </>
          ) : (
            <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
              Read-Only • Pending Accounts / Admin Approval
            </span>
          )}
        </div>
      )}

      {/* Full image lightbox */}
      {showImg && safeScreenshotUrl && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setShowImg(false)}
        >
          <img
            src={safeScreenshotUrl}
            alt="Receipt"
            className="max-w-2xl max-h-[85vh] object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div>
      <span className="text-gray-400">{label}: </span>
      <span
        className={`text-gray-700 ${bold ? "font-bold text-green-700" : ""} ${mono ? "font-mono" : "font-medium"}`}
      >
        {value}
      </span>
    </div>
  );
}
