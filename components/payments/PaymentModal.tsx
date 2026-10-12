"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { X, Upload, Calculator, CheckCircle2, Image } from "lucide-react";
import { calculateGST, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface Deal {
  id: string;
  leadId: string;
  quotedPrice: string;
  serviceType: string;
  lead: {
    companyName: string | null;
    contactName: string | null;
    phoneNumber: string;
  };
}

const PAYMENT_MODES = ["UPI", "NEFT/IMPS", "Cheque", "Gateway"];
const USER_TYPES = [
  { value: "new_user", label: "New User" },
  { value: "existing_user", label: "Existing User" },
];

export function PaymentModal({
  deal,
  onClose,
  onSaved,
}: {
  deal: Deal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userType, setUserType] = useState("new_user");
  const [panelUserId, setPanelUserId] = useState("");
  const [creditsToAdd, setCreditsToAdd] = useState("");
  const [baseAmount, setBaseAmount] = useState(deal.quotedPrice?.toString() || "");
  const [tdsAmount, setTdsAmount] = useState("0");
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [gstin, setGstin] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [screenshotPreview, setScreenshotPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // GST calc
  const base = parseFloat(baseAmount) || 0;
  const tds = parseFloat(tdsAmount) || 0;
  const { tax, total } = calculateGST(base);
  const finalAmount = Math.max(0, total - tds);

  // Drag-drop screenshot upload
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setUploading(true);

    try {
      // Get presigned URL
      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      const { presignedUrl, publicUrl } = await presignRes.json();

      // Upload directly to MinIO
      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadRes.ok) throw new Error("Upload failed");

      setScreenshotUrl(publicUrl);
      setScreenshotPreview(URL.createObjectURL(file));
      toast.success("Screenshot uploaded ✅");
    } catch {
      toast.error("Failed to upload screenshot");
    } finally {
      setUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".pdf"] },
    multiple: false,
  });

  async function handleSubmit() {
    if (!panelUserId || !creditsToAdd || !screenshotUrl) {
      toast.error("Panel User ID, Credits, and Payment Screenshot are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: deal.id,
          leadId: deal.leadId,
          userType,
          panelUserId,
          creditsToAdd: parseInt(creditsToAdd),
          originalAmount: base,
          taxAmount: tax,
          tdsAmount: tds,
          finalAmount,
          paymentMode,
          gstin: gstin || null,
          screenshotUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to submit payment");
        return;
      }
      onSaved();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-green-600" />
              Payment Collection
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {deal.lead.companyName || deal.lead.phoneNumber} — {deal.serviceType}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* User Type */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              User Type *
            </label>
            <div className="flex gap-2">
              {USER_TYPES.map((ut) => (
                <button
                  key={ut.value}
                  onClick={() => setUserType(ut.value)}
                  className={`flex-1 py-2 text-sm rounded-lg border transition font-medium ${
                    userType === ut.value
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {ut.label}
                </button>
              ))}
            </div>
          </div>

          {/* Panel User ID + Credits */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Panel User ID *
              </label>
              <input
                type="text"
                value={panelUserId}
                onChange={(e) => setPanelUserId(e.target.value)}
                placeholder="e.g. TXT001234"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Credits to Add *
              </label>
              <input
                type="number"
                value={creditsToAdd}
                onChange={(e) => setCreditsToAdd(e.target.value)}
                placeholder="e.g. 10000"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Amount Calculator */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Amount Breakdown
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 w-32 shrink-0">Base Amount (₹)</label>
                <input
                  type="number"
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">GST @ 18%</span>
                <span className="font-medium text-gray-700">
                  + {formatCurrency(tax)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 w-32 shrink-0">TDS Deduction</label>
                <input
                  type="number"
                  value={tdsAmount}
                  onChange={(e) => setTdsAmount(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">
                  Final Receivable
                </span>
                <span className="text-lg font-bold text-green-700">
                  {formatCurrency(finalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Mode + GSTIN */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Payment Mode *
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                GSTIN (optional)
              </label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
          </div>

          {/* Screenshot Upload */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Payment Screenshot *
            </label>
            {screenshotPreview ? (
              <div className="relative">
                <img
                  src={screenshotPreview}
                  alt="Payment receipt"
                  className="w-full h-32 object-cover rounded-xl border border-gray-200"
                />
                <button
                  onClick={() => {
                    setScreenshotPreview("");
                    setScreenshotUrl("");
                  }}
                  className="absolute top-2 right-2 bg-white rounded-full p-1 shadow border border-gray-200"
                >
                  <X className="w-3 h-3 text-gray-600" />
                </button>
                <div className="mt-1 flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Uploaded successfully
                </div>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                  isDragActive
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                }`}
              >
                <input {...getInputProps()} />
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-blue-600">
                    <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Uploading...
                  </div>
                ) : (
                  <>
                    <Image className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                    <p className="text-sm text-gray-500">
                      Drop screenshot here or click to browse
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      JPG, PNG, PDF supported
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || uploading || !screenshotUrl}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-60 flex items-center gap-2 font-semibold shadow-xs"
            >
              {saving && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              Submit for Verification
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
