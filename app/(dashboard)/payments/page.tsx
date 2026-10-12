"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, CheckCircle2, XCircle, Clock, ExternalLink } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
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
}

async function fetchPayments(status: string): Promise<{ payments: Payment[] }> {
  const res = await fetch(`/api/payments?status=${status}`);
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
  const [activeTab, setActiveTab] = useState("pending_verification");

  const { data, isLoading } = useQuery({
    queryKey: ["payments", activeTab],
    queryFn: () => fetchPayments(activeTab),
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
      queryClient.invalidateQueries({ queryKey: ["payments"] });
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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
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
}: {
  payment: Payment;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isPending: boolean;
}) {
  const [showImg, setShowImg] = useState(false);
  const StatusConfig = STATUS_CONFIG[payment.opsApprovalStatus as keyof typeof STATUS_CONFIG];
  const StatusIcon = StatusConfig?.icon || Clock;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start gap-4">
        {/* Screenshot thumbnail */}
        <div className="shrink-0">
          <button
            onClick={() => setShowImg(true)}
            className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center hover:opacity-80 transition"
          >
            <img
              src={payment.screenshotUrl}
              alt="Receipt"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </button>
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
        </div>
      </div>

      {/* Action buttons for pending */}
      {payment.opsApprovalStatus === "pending_verification" && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 justify-end">
          <a
            href={payment.screenshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View Receipt
          </a>
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
            Approve & Add Credits
          </button>
        </div>
      )}

      {/* Full image lightbox */}
      {showImg && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setShowImg(false)}
        >
          <img
            src={payment.screenshotUrl}
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
