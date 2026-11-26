"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  Upload,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  Info,
  Phone,
  Sparkles,
  UserCheck,
  Users,
  Shuffle,
  Database,
  Clock,
  ArrowRight,
  Zap,
  RefreshCw,
  Check,
  FileCheck,
} from "lucide-react";
import { toast } from "sonner";
import { normalizePhone } from "@/lib/utils";
import { useSession } from "@/components/layout/SessionProvider";

interface ExtractedLead {
  phone: string;
  secondaryPhone?: string;
  name: string;
  company: string;
  email?: string;
  vertical: string;
  service: string;
  website?: string;
  remark?: string;
  leadDate?: string;
  closeDate?: string;
  userId?: string;
  password?: string;
  credits?: number;
  amount?: number;
  stage?: string;
}

type SheetType = "auto" | "cold" | "followup" | "interested" | "closed_deal";

interface ExistingLeadMatch {
  id: string;
  phone: string;
  contactName: string | null;
  companyName: string | null;
  status: string;
}

interface CSVImporterProps {
  onClose: () => void;
  onImported: () => void;
}

interface ImportResult {
  imported: number;
  updated?: number;
  duplicates: number;
  pendingApprovals?: number;
  invalid: number;
  total: number;
  durationMs?: number;
  message?: string;
}

function cleanCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val).trim();
  // Strip Excel trailing .0 on numeric IDs/phones
  if (/^\d+\.0+$/.test(str)) {
    str = str.split(".")[0];
  }
  return str;
}

function parseNumericCell(val: unknown): number {
  const s = cleanCell(val).replace(/,/g, "").replace(/[^\d.]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/**
 * Universal matrix parser supporting:
 * - Simple cold calling lists (Phone only or Phone/Name/Company/Vertical/Service)
 * - Google Sheet ClosedDeal export (CUSTOMER NAME, CONTACT NUMBER, COMPANY NAME, MAIL ID, USER ID, PASSWORD, PRODUCT, CREDITS, AMOUNT(inc GST), CLOSE DATE, LEAD DATE, REMARK)
 * - Google Sheet Interested export (Phone, Remark, Other details, Bussiness type, Service + date divider rows)
 * - Google Sheet followup export (DATE, Number, Remark, Name)
 */
function parseRawMatrix(
  matrix: (string | number)[][],
  fileNameHint = ""
): { leads: ExtractedLead[]; detectedSheetType: SheetType } {
  if (!matrix || matrix.length === 0) {
    return { leads: [], detectedSheetType: "cold" };
  }

  const cleanRows = matrix.filter(
    (row) =>
      row &&
      row.some(
        (cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""
      )
  );

  if (cleanRows.length === 0) {
    return { leads: [], detectedSheetType: "cold" };
  }

  const firstRow = cleanRows[0].map(cleanCell);
  const firstCellDigits = cleanCell(firstRow[0]).replace(/\D/g, "");
  const isFirstRowPhone = firstCellDigits.length >= 10;

  let phoneColIdx = -1;
  let nameColIdx = -1;
  let companyColIdx = -1;
  let emailColIdx = -1;
  let userIdColIdx = -1;
  let passwordColIdx = -1;
  let verticalColIdx = -1;
  let serviceColIdx = -1;
  let creditsColIdx = -1;
  let amountColIdx = -1;
  let closeDateColIdx = -1;
  let leadDateColIdx = -1;
  let remarkColIdx = -1;
  let otherDetailsColIdx = -1;
  let stageColIdx = -1;

  let hasHeaders = false;

  if (!isFirstRowPhone) {
    firstRow.forEach((colName, idx) => {
      const lower = colName.toLowerCase().replace(/[\s_-]/g, "");
      if (!lower) return;
      if (
        phoneColIdx === -1 &&
        (lower.includes("phone") ||
          lower.includes("mobile") ||
          lower.includes("contactnumber") ||
          lower === "number" ||
          lower.includes("cell") ||
          lower.includes("tel") ||
          lower.includes("msisdn"))
      ) {
        phoneColIdx = idx;
        hasHeaders = true;
      } else if (
        nameColIdx === -1 &&
        (lower.includes("customername") ||
          lower.includes("contactname") ||
          lower === "name" ||
          lower.includes("person") ||
          lower.includes("client"))
      ) {
        nameColIdx = idx;
        hasHeaders = true;
      } else if (
        companyColIdx === -1 &&
        (lower.includes("company") ||
          lower.includes("org") ||
          lower.includes("firm") ||
          lower.includes("enterprise"))
      ) {
        companyColIdx = idx;
        hasHeaders = true;
      } else if (
        emailColIdx === -1 &&
        (lower.includes("mail") || lower.includes("email"))
      ) {
        emailColIdx = idx;
        hasHeaders = true;
      } else if (
        userIdColIdx === -1 &&
        (lower === "userid" || lower.includes("paneluser"))
      ) {
        userIdColIdx = idx;
        hasHeaders = true;
      } else if (passwordColIdx === -1 && lower.includes("password")) {
        passwordColIdx = idx;
        hasHeaders = true;
      } else if (
        verticalColIdx === -1 &&
        (lower.includes("vertical") ||
          lower.includes("industry") ||
          lower.includes("category") ||
          lower.includes("sector") ||
          lower.includes("businesstype") ||
          lower.includes("bussinesstype"))
      ) {
        verticalColIdx = idx;
        hasHeaders = true;
      } else if (
        serviceColIdx === -1 &&
        (lower.includes("service") ||
          lower.includes("product") ||
          lower.includes("interest"))
      ) {
        serviceColIdx = idx;
        hasHeaders = true;
      } else if (
        creditsColIdx === -1 &&
        (lower.includes("credit") || lower.includes("quantity") || lower.includes("qty"))
      ) {
        creditsColIdx = idx;
        hasHeaders = true;
      } else if (
        amountColIdx === -1 &&
        (lower.includes("amount") || lower.includes("price") || lower.includes("value"))
      ) {
        amountColIdx = idx;
        hasHeaders = true;
      } else if (closeDateColIdx === -1 && lower.includes("closedate")) {
        closeDateColIdx = idx;
        hasHeaders = true;
      } else if (
        leadDateColIdx === -1 &&
        (lower.includes("leaddate") || lower === "date")
      ) {
        leadDateColIdx = idx;
        hasHeaders = true;
      } else if (
        remarkColIdx === -1 &&
        (lower.includes("remark") ||
          lower.includes("comment") ||
          lower.includes("note") ||
          lower.includes("feedback"))
      ) {
        remarkColIdx = idx;
        hasHeaders = true;
      } else if (otherDetailsColIdx === -1 && lower.includes("otherdetail")) {
        otherDetailsColIdx = idx;
        hasHeaders = true;
      } else if (
        stageColIdx === -1 &&
        (lower.includes("stage") || lower.includes("status"))
      ) {
        stageColIdx = idx;
        hasHeaders = true;
      }
    });
  }

  if (phoneColIdx === -1) {
    phoneColIdx = 0;
  }

  const dataRows = hasHeaders ? cleanRows.slice(1) : cleanRows;
  const leads: ExtractedLead[] = [];
  let currentSectionDate = "";

  for (const row of dataRows) {
    const firstCell = cleanCell(row[0]);
    // Detect date-divider rows like "18-08-26" in the Interested sheet
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(firstCell) && !cleanCell(row[1])) {
      currentSectionDate = firstCell;
      continue;
    }

    let rawPhone = cleanCell(row[phoneColIdx]);
    let secondaryPhone = "";

    if (rawPhone.includes("/") || rawPhone.includes(",")) {
      const parts = rawPhone.split(/[\/,]/).map((p) => p.trim());
      rawPhone = parts[0] || "";
      if (parts[1]) {
        const secNorm = normalizePhone(parts[1]);
        if (secNorm && secNorm.length === 10) secondaryPhone = secNorm;
      }
    }

    if (!rawPhone || rawPhone.replace(/\D/g, "").length < 10) {
      for (let c = 0; c < row.length; c++) {
        const candidate = cleanCell(row[c]);
        if (candidate.replace(/\D/g, "").length >= 10) {
          rawPhone = candidate;
          break;
        }
      }
    }

    const normPhone = normalizePhone(rawPhone);
    if (normPhone && normPhone.length === 10) {
      const rawVertical = verticalColIdx >= 0 ? cleanCell(row[verticalColIdx]) : "";
      const isUrl = /^https?:\/\//i.test(rawVertical) || /^www\./i.test(rawVertical);
      const remarkParts = [
        remarkColIdx >= 0 ? cleanCell(row[remarkColIdx]) : "",
        otherDetailsColIdx >= 0 ? cleanCell(row[otherDetailsColIdx]) : "",
      ].filter(Boolean);

      leads.push({
        phone: normPhone,
        secondaryPhone: secondaryPhone || undefined,
        name: nameColIdx >= 0 ? cleanCell(row[nameColIdx]) : "",
        company: companyColIdx >= 0 ? cleanCell(row[companyColIdx]) : "",
        email: emailColIdx >= 0 ? cleanCell(row[emailColIdx]) : undefined,
        vertical: isUrl ? "" : rawVertical,
        website: isUrl ? rawVertical : undefined,
        service: serviceColIdx >= 0 ? cleanCell(row[serviceColIdx]) : "",
        remark: remarkParts.join(" | ") || undefined,
        leadDate:
          (leadDateColIdx >= 0 ? cleanCell(row[leadDateColIdx]) : "") ||
          currentSectionDate ||
          undefined,
        closeDate: closeDateColIdx >= 0 ? cleanCell(row[closeDateColIdx]) : undefined,
        userId: userIdColIdx >= 0 ? cleanCell(row[userIdColIdx]) : undefined,
        password: passwordColIdx >= 0 ? cleanCell(row[passwordColIdx]) : undefined,
        credits: creditsColIdx >= 0 ? parseNumericCell(row[creditsColIdx]) : undefined,
        amount: amountColIdx >= 0 ? parseNumericCell(row[amountColIdx]) : undefined,
        stage: stageColIdx >= 0 ? cleanCell(row[stageColIdx]) : undefined,
      });
    }
  }

  const lowerName = fileNameHint.toLowerCase();
  let detectedSheetType: SheetType = "cold";
  if (amountColIdx >= 0 || creditsColIdx >= 0 || closeDateColIdx >= 0 || userIdColIdx >= 0 || lowerName.includes("closed")) {
    detectedSheetType = "closed_deal";
  } else if (lowerName.includes("interest")) {
    detectedSheetType = "interested";
  } else if (lowerName.includes("follow")) {
    detectedSheetType = "followup";
  } else if (remarkColIdx >= 0 || leadDateColIdx >= 0 || stageColIdx >= 0) {
    detectedSheetType = "auto";
  }

  return { leads, detectedSheetType };
}

export function CSVImporter({ onClose, onImported }: CSVImporterProps) {
  const [extractedLeads, setExtractedLeads] = useState<ExtractedLead[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Progressive UX tracking
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusText, setImportStatusText] = useState("");

  // Google Sheet migration & duplicate resolution state
  const [sheetType, setSheetType] = useState<SheetType>("cold");
  const [existingMatches, setExistingMatches] = useState<Record<string, ExistingLeadMatch>>({});
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [defaultDuplicateAction, setDefaultDuplicateAction] = useState<"skip" | "update">("skip");
  const [perLeadAction, setPerLeadAction] = useState<Record<string, "skip" | "update">>({});

  const { userId } = useSession();

  // Assignment configuration
  const [assignmentMode, setAssignmentMode] = useState<"unassigned" | "specific" | "round_robin">("unassigned");
  const [selectedRepId, setSelectedRepId] = useState("");
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; fullName: string; role: string }>>([]);

  // Fetch active team members (Sales Reps, Level 2 Managers, and Super Admin) for assignment
  useEffect(() => {
    async function loadTeam() {
      try {
        const res = await fetch("/api/team");
        if (res.ok) {
          const data = await res.json();
          const assignable = (data.users || []).filter(
            (u: { role: string; isActive?: boolean }) =>
              ["sales_rep", "sales_manager", "super_admin"].includes(u.role) && u.isActive !== false
          );
          setTeamMembers(assignable);
          if (assignable.length > 0) {
            // Default to self if available, otherwise first user
            const selfUser = assignable.find((u: { id: string }) => u.id === userId);
            setSelectedRepId(selfUser ? selfUser.id : assignable[0].id);
          }
        }
      } catch (e) {
        console.error("Failed to load team for assignment", e);
      }
    }
    loadTeam();
  }, [userId]);

  // Download official sample CSV template
  function downloadSampleCSV() {
    const csvContent = `Phone,Name,Company,Vertical,Service
9902101007,Aaditya,Textora Technologies,CPaaS & Messaging,WhatsApp API
9876543210,Dr. Rakesh Sharma,Apex Health Diagnostics,Pathlab,Bulk SMS
9811223344,Amit Verma,Grand Realty Corp,Real Estate,Virtual WhatsApp
9765432109,Priya Singh,FitLife Fitness Studio,Gym,RCS Messaging
9988776655,Vikram Patel,EduSmart Coaching,EdTech,Combo WA+SMS`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "textora_leads_sample_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Sample CSV template downloaded! 📥");
  }

  function handleReset() {
    setExtractedLeads([]);
    setFileName("");
    setResult(null);
    setImportProgress(0);
    setImportStatusText("");
    setExistingMatches({});
    setPerLeadAction({});
    setDefaultDuplicateAction("skip");
    setSheetType("cold");
  }

  async function checkDuplicatesInCrm(leads: ExtractedLead[]) {
    if (leads.length === 0) {
      setExistingMatches({});
      return;
    }
    setCheckingDuplicates(true);
    try {
      const phones = Array.from(new Set(leads.map((l) => l.phone)));
      const res = await fetch("/api/leads/import/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones }),
      });
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, ExistingLeadMatch> = {};
        for (const item of data.existing || []) {
          map[item.phone] = item;
        }
        setExistingMatches(map);
        setPerLeadAction({});
      }
    } catch (e) {
      console.error("Failed to check duplicates", e);
    } finally {
      setCheckingDuplicates(false);
    }
  }

  function applyDuplicateActionToAll(action: "skip" | "update") {
    setDefaultDuplicateAction(action);
    const next: Record<string, "skip" | "update"> = {};
    Object.keys(existingMatches).forEach((phone) => {
      next[phone] = action;
    });
    setPerLeadAction(next);
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setExistingMatches({});
    setPerLeadAction({});

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      Papa.parse<(string | number)[]>(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const { leads: parsed, detectedSheetType } = parseRawMatrix(
            results.data as (string | number)[][],
            file.name
          );
          setExtractedLeads(parsed);
          setSheetType(detectedSheetType);
          if (detectedSheetType === "closed_deal") {
            setDefaultDuplicateAction("update");
          }
          if (parsed.length === 0) {
            toast.error("No valid 10-digit phone numbers found in this CSV.");
          } else {
            toast.success(`Found ${parsed.length} valid phone numbers!`);
            checkDuplicatesInCrm(parsed);
          }
        },
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
          header: 1,
          defval: "",
          raw: false,
          dateNF: "dd-mm-yyyy",
        });
        const { leads: parsed, detectedSheetType } = parseRawMatrix(matrix, file.name);
        setExtractedLeads(parsed);
        setSheetType(detectedSheetType);
        if (detectedSheetType === "closed_deal") {
          setDefaultDuplicateAction("update");
        }
        if (parsed.length === 0) {
          toast.error("No valid 10-digit phone numbers found in this Excel file.");
        } else {
          toast.success(`Found ${parsed.length} valid phone numbers!`);
          checkDuplicatesInCrm(parsed);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error("Please upload a CSV or Excel file (.csv, .xlsx, .xls)");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
    multiple: false,
  });

  async function handleImport() {
    if (extractedLeads.length === 0) return;
    setImporting(true);
    setImportProgress(10);
    setImportStatusText("Validating phone numbers and payload schema...");

    try {
      const CHUNK_SIZE = 500;
      const totalLeads = extractedLeads.length;
      const startTime = Date.now();

      // If under or equal to 500 leads, run single fast batch with progressive animation
      if (totalLeads <= CHUNK_SIZE) {
        setImportProgress(30);
        setImportStatusText(`Checking CRM deduplication & inserting ${totalLeads} leads...`);

        const progressTimer = setInterval(() => {
          setImportProgress((prev) => (prev < 85 ? prev + 15 : prev));
        }, 120);

        const payloadLeads = extractedLeads.map((l) => ({
          ...l,
          duplicateAction: existingMatches[l.phone]
            ? perLeadAction[l.phone] || defaultDuplicateAction
            : undefined,
        }));

        const payload = {
          leads: payloadLeads,
          assignmentMode,
          assignToRepId: assignmentMode === "specific" ? selectedRepId : null,
          sheetType,
          defaultDuplicateAction,
        };

        const res = await fetch("/api/leads/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        clearInterval(progressTimer);

        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Import failed");
          setImporting(false);
          return;
        }

        setImportProgress(100);
        setImportStatusText("Batch insertion completed!");
        await new Promise((r) => setTimeout(r, 200));

        setResult(data);
        toast.success(`✅ Imported ${data.imported} leads in ${(data.durationMs / 1000).toFixed(2)}s!`);
      } else {
        // Chunked imports for large sheets (> 500 rows)
        const totalChunks = Math.ceil(totalLeads / CHUNK_SIZE);
        const accumulatedResult: ImportResult = {
          imported: 0,
          updated: 0,
          duplicates: 0,
          pendingApprovals: 0,
          invalid: 0,
          total: totalLeads,
          durationMs: 0,
        };

        for (let i = 0; i < totalLeads; i += CHUNK_SIZE) {
          const chunk = extractedLeads.slice(i, i + CHUNK_SIZE).map((l) => ({
            ...l,
            duplicateAction: existingMatches[l.phone]
              ? perLeadAction[l.phone] || defaultDuplicateAction
              : undefined,
          }));
          const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;

          setImportStatusText(
            `Writing batch ${chunkIndex} of ${totalChunks} (${Math.min(i + CHUNK_SIZE, totalLeads)} / ${totalLeads} leads)...`
          );

          const payload = {
            leads: chunk,
            assignmentMode,
            assignToRepId: assignmentMode === "specific" ? selectedRepId : null,
            sheetType,
            defaultDuplicateAction,
          };

          const res = await fetch("/api/leads/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const data = await res.json();
          if (!res.ok) {
            toast.error(data.error || `Batch ${chunkIndex} failed`);
            setImporting(false);
            return;
          }

          accumulatedResult.imported += data.imported || 0;
          accumulatedResult.updated = (accumulatedResult.updated || 0) + (data.updated || 0);
          accumulatedResult.duplicates += data.duplicates || 0;
          accumulatedResult.pendingApprovals = (accumulatedResult.pendingApprovals || 0) + (data.pendingApprovals || 0);
          accumulatedResult.invalid += data.invalid || 0;

          const progressPercent = Math.min(
            95,
            Math.round(((i + chunk.length) / totalLeads) * 100)
          );
          setImportProgress(progressPercent);
        }

        accumulatedResult.durationMs = Date.now() - startTime;
        setImportProgress(100);
        setImportStatusText("All batches committed successfully!");
        await new Promise((r) => setTimeout(r, 200));

        setResult(accumulatedResult);
        toast.success(`✅ Imported ${accumulatedResult.imported} leads in ${(accumulatedResult.durationMs / 1000).toFixed(2)}s!`);
      }
    } catch {
      toast.error("Network error during import");
    } finally {
      setImporting(false);
    }
  }

  const preview = extractedLeads.slice(0, 5);
  const selectedMember = teamMembers.find((r) => r.id === selectedRepId);
  const assignedRepName = selectedMember
    ? `${selectedMember.fullName}${selectedMember.id === userId ? " (You)" : ""}`
    : "Selected Assignee";

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto border border-gray-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-slate-900 text-white rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              {importing ? (
                <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
              ) : result ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                {importing
                  ? "Importing Leads into CRM..."
                  : result
                  ? "Import Summary Report"
                  : "Import Leads Batch (CSV / Excel)"}
              </h3>
              <p className="text-[11px] text-slate-300">
                {importing
                  ? "Live high-speed database write in progress"
                  : result
                  ? "Execution summary and duplicate stats"
                  : "1-click upload cold calling lists into your dialer"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="text-slate-400 hover:text-white rounded-lg p-1.5 hover:bg-slate-800 transition disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 flex-1">
          {/* ============================================================== */}
          {/* VIEW 1: LIVE PROGRESS SCREEN WHILE IMPORTING                   */}
          {/* ============================================================== */}
          {importing && (
            <div className="py-4 space-y-6 animate-in fade-in zoom-in-95 duration-200">
              {/* Animated Engine Header */}
              <div className="text-center space-y-2">
                <div className="relative inline-flex items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shadow-inner">
                    <Zap className="w-8 h-8 text-emerald-600 animate-pulse" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                  </span>
                </div>
                <h4 className="text-base font-bold text-gray-900">
                  Processing {extractedLeads.length.toLocaleString()} Leads
                </h4>
                <p className="text-xs text-gray-500 font-medium">
                  {importStatusText || "Inserting contacts into database..."}
                </p>
              </div>

              {/* Progress Bar Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-gray-700 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    Overall Progress
                  </span>
                  <span className="text-emerald-700 font-mono font-bold">
                    {importProgress}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden p-0.5">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-300 ease-out shadow-xs"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-gray-400 pt-0.5">
                  <span>Atomic batch engine active</span>
                  <span>
                    {Math.min(
                      extractedLeads.length,
                      Math.round((importProgress / 100) * extractedLeads.length)
                    )}{" "}
                    / {extractedLeads.length} rows
                  </span>
                </div>
              </div>

              {/* 3-Step Live Pipeline Tracker */}
              <div className="bg-white rounded-xl p-3.5 border border-gray-200 space-y-2.5 shadow-2xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Execution Pipeline
                </p>

                <div className="space-y-2">
                  {/* Step 1 */}
                  <div className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800">
                        Phone Normalization & Schema Validation
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Passed
                    </span>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        importProgress >= 50
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-emerald-50 text-emerald-600 animate-pulse"
                      }`}
                    >
                      {importProgress >= 50 ? (
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      ) : (
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800">
                        Tenant Deduplication Engine
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        importProgress >= 50
                          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                          : "text-amber-700 bg-amber-50 border-amber-200"
                      }`}
                    >
                      {importProgress >= 50 ? "Completed" : "Checking"}
                    </span>
                  </div>

                  {/* Step 3 */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        importProgress === 100
                          ? "bg-emerald-100 text-emerald-700"
                          : importProgress >= 50
                          ? "bg-emerald-50 text-emerald-600 animate-pulse"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {importProgress === 100 ? (
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      ) : importProgress >= 50 ? (
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      ) : (
                        <span className="text-[10px] font-bold">3</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800">
                        Atomic Batch Write & Rep Assignment
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        importProgress === 100
                          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                          : importProgress >= 50
                          ? "text-amber-700 bg-amber-50 border-amber-200"
                          : "text-gray-400 bg-gray-50 border-gray-200"
                      }`}
                    >
                      {importProgress === 100
                        ? "Committed"
                        : importProgress >= 50
                        ? "Writing"
                        : "Queued"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-gray-400 justify-center">
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                <span>Multi-row batch pipeline. Fast and non-blocking.</span>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* VIEW 2: EXECUTIVE COMPLETION REPORT                            */}
          {/* ============================================================== */}
          {result && !importing && (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              {/* Success Hero */}
              <div className="text-center space-y-2 bg-gradient-to-b from-emerald-50/80 via-emerald-50/30 to-transparent p-5 rounded-2xl border border-emerald-100">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-md shadow-emerald-500/20">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h4 className="text-base font-bold text-gray-950">
                  Batch Import Completed!
                </h4>
                <p className="text-xs text-gray-600 max-w-sm mx-auto">
                  {result.message ||
                    "Your leads have been processed, deduplicated, and added to Textora Engage."}
                </p>

                {/* Speed Pill */}
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-emerald-200 text-xs text-emerald-800 font-semibold shadow-2xs mt-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    Execution Time:{" "}
                    <strong>
                      {result.durationMs !== undefined
                        ? `${(result.durationMs / 1000).toFixed(2)}s (${result.durationMs}ms)`
                        : "< 0.3s"}
                    </strong>
                  </span>
                </div>
              </div>

              {/* 4 Stat Metric Cards */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-emerald-700 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      New Leads
                    </span>
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <p className="text-2xl font-black text-emerald-800 font-mono">
                    +{result.imported.toLocaleString()}
                    {(result.updated || 0) > 0 && (
                      <span className="text-sm font-bold text-teal-700 ml-1.5">
                        (+{result.updated} updated)
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                    {(result.pendingApprovals || 0) > 0
                      ? `${result.pendingApprovals} closed deals sent for Ops approval`
                      : "Added to dialer queue"}
                  </p>
                </div>

                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-amber-700 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      Skipped Duplicates
                    </span>
                    <Users className="w-4 h-4" />
                  </div>
                  <p className="text-2xl font-black text-amber-800 font-mono">
                    {result.duplicates.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                    Skipped per duplicate rule
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-slate-600 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      Invalid Format
                    </span>
                    <AlertCircle className="w-4 h-4 text-slate-400" />
                  </div>
                  <p className="text-2xl font-black text-slate-700 font-mono">
                    {result.invalid.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Missing or bad numbers
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-slate-600 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      Total Rows
                    </span>
                    <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                  </div>
                  <p className="text-2xl font-black text-slate-900 font-mono">
                    {result.total.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Processed from file
                  </p>
                </div>
              </div>

              {/* Assignment Pill */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs">
                <span className="text-gray-500 font-medium flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  Lead Assignment:
                </span>
                <span className="font-bold text-gray-800">
                  {assignmentMode === "unassigned" && "Cold Lead Pool (Available to all)"}
                  {assignmentMode === "specific" && `Assigned to ${assignedRepName}`}
                  {assignmentMode === "round_robin" &&
                    `Round Robin (${teamMembers.length} active reps)`}
                </span>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* VIEW 3: FILE UPLOAD, ASSIGNMENT & PREVIEW (INITIAL STATE)       */}
          {/* ============================================================== */}
          {!importing && !result && (
            <>
              {/* Sample CSV Download Callout Banner */}
              <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-emerald-950">
                      Need a pre-formatted template?
                    </p>
                    <p className="text-[11px] text-emerald-800">
                      Download our sample sheet with example columns (Phone, Name, Company, Vertical).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={downloadSampleCSV}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition shrink-0 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  Sample CSV
                </button>
              </div>

              {/* Flexible Format Tip Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-slate-600">
                <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11px]">
                  <strong>Accepted formats:</strong> Full sheets with headers OR sheets where <strong>1st column is only phone numbers</strong>. Missing names and companies will simply be left blank so sales representatives can add customer names during calls.
                </p>
              </div>

              {/* Dropzone */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition ${
                  isDragActive
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-gray-200 hover:border-emerald-400 hover:bg-gray-50/70"
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="w-8 h-8 text-emerald-600 mx-auto mb-2 opacity-80" />
                {isDragActive ? (
                  <p className="text-emerald-700 font-semibold text-sm">Drop CSV/Excel file here...</p>
                ) : fileName ? (
                  <div>
                    <p className="text-gray-900 font-bold text-sm">{fileName}</p>
                    <p className="text-xs text-emerald-600 font-medium mt-1">
                      Click or drag another file to replace
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-gray-800 font-semibold text-sm">
                      Drag & Drop CSV / Excel or click to browse
                    </p>
                    <p className="text-gray-400 text-xs mt-1">
                      Supports .csv, .xlsx, .xls with up to 100,000 rows
                    </p>
                  </>
                )}
              </div>

              {/* Google Sheet Type / Stage Selector */}
              {extractedLeads.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      Sheet Type / Target Stage:
                    </span>
                    <span className="text-[11px] text-emerald-700 font-semibold">
                      Auto-detected from columns
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {(
                      [
                        { id: "cold", label: "Cold List (New)" },
                        { id: "followup", label: "Follow-Up" },
                        { id: "interested", label: "Interested" },
                        { id: "closed_deal", label: "Closed Deals" },
                        { id: "auto", label: "Auto-Detect" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSheetType(opt.id)}
                        className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                          sheetType === opt.id
                            ? "bg-white border-emerald-500 text-emerald-700 shadow-xs ring-1 ring-emerald-500"
                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {sheetType === "closed_deal" && (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      Closed deals will be uploaded to <strong>Payments (Pending Approval)</strong> &amp; Pipeline (<strong>Payment Pending</strong>). Once approved, they automatically move to <strong>Closed Won</strong>.
                    </p>
                  )}
                </div>
              )}

              {/* Duplicate Leads Resolution (Skip or Update per lead + Apply to All) */}
              {extractedLeads.length > 0 && (checkingDuplicates || Object.keys(existingMatches).length > 0) && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      {checkingDuplicates
                        ? "Checking existing CRM leads..."
                        : `${Object.keys(existingMatches).length} Existing Lead(s) Found in CRM`}
                    </span>
                    {!checkingDuplicates && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-amber-800 font-medium">Apply to all:</span>
                        <button
                          type="button"
                          onClick={() => applyDuplicateActionToAll("skip")}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                            defaultDuplicateAction === "skip"
                              ? "bg-amber-600 text-white border-amber-600"
                              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Skip All
                        </button>
                        <button
                          type="button"
                          onClick={() => applyDuplicateActionToAll("update")}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                            defaultDuplicateAction === "update"
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Update All
                        </button>
                      </div>
                    )}
                  </div>

                  {!checkingDuplicates && (
                    <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-amber-200 divide-y divide-gray-100">
                      {Object.values(existingMatches).map((match) => {
                        const action = perLeadAction[match.phone] || defaultDuplicateAction;
                        return (
                          <div
                            key={match.id}
                            className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-mono font-semibold text-gray-800">
                                {match.phone}
                              </span>
                              <span className="text-gray-500 ml-2 truncate">
                                {match.contactName || match.companyName || "Unnamed Lead"} ({match.status})
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setPerLeadAction((prev) => ({ ...prev, [match.phone]: "skip" }))
                                }
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold border cursor-pointer ${
                                  action === "skip"
                                    ? "bg-amber-100 text-amber-800 border-amber-300"
                                    : "bg-white text-gray-500 border-gray-200"
                                }`}
                              >
                                Skip
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPerLeadAction((prev) => ({ ...prev, [match.phone]: "update" }))
                                }
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold border cursor-pointer ${
                                  action === "update"
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                    : "bg-white text-gray-500 border-gray-200"
                                }`}
                              >
                                Update
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Lead Assignment Option (Level 2/3 Feature) */}
              {extractedLeads.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-emerald-600" />
                      Assign Imported Leads To:
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {assignmentMode === "unassigned" && "Pool for later assignment"}
                      {assignmentMode === "specific" && "All assigned to selected rep"}
                      {assignmentMode === "round_robin" && "Evenly split among team"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setAssignmentMode("unassigned")}
                      className={`px-2.5 py-2 rounded-lg text-xs font-medium border text-center transition ${
                        assignmentMode === "unassigned"
                          ? "bg-white border-emerald-500 text-emerald-700 shadow-xs ring-1 ring-emerald-500 font-semibold"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Unassigned Pool
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignmentMode("specific")}
                      className={`px-2.5 py-2 rounded-lg text-xs font-medium border text-center transition ${
                        assignmentMode === "specific"
                          ? "bg-white border-emerald-500 text-emerald-700 shadow-xs ring-1 ring-emerald-500 font-semibold"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Specific Rep
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignmentMode("round_robin")}
                      className={`px-2.5 py-2 rounded-lg text-xs font-medium border text-center transition ${
                        assignmentMode === "round_robin"
                          ? "bg-white border-emerald-500 text-emerald-700 shadow-xs ring-1 ring-emerald-500 font-semibold"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Round Robin
                    </button>
                  </div>

                  {assignmentMode === "specific" && (
                    <div className="pt-1 animate-in fade-in duration-150">
                      <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                        Select Assignee (Sales Rep, Level 2 Manager, or Yourself):
                      </label>
                      <select
                        value={selectedRepId}
                        onChange={(e) => setSelectedRepId(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-500 text-gray-800"
                      >
                        {teamMembers.length === 0 ? (
                          <option value="">No active team members found</option>
                        ) : (
                          <>
                            {teamMembers.some((r) => r.id === userId) && (
                              <optgroup label="Assign to Yourself">
                                {teamMembers
                                  .filter((r) => r.id === userId)
                                  .map((u) => (
                                    <option key={u.id} value={u.id}>
                                      ⭐ {u.fullName} ({u.role === "super_admin" ? "Super Admin" : u.role === "sales_manager" ? "Sales Manager" : "Sales Rep"} • You)
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                            {teamMembers.some((r) => r.role === "sales_manager" && r.id !== userId) && (
                              <optgroup label="Level 2 • Sales Managers">
                                {teamMembers
                                  .filter((r) => r.role === "sales_manager" && r.id !== userId)
                                  .map((rep) => (
                                    <option key={rep.id} value={rep.id}>
                                      {rep.fullName} (Sales Manager)
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                            {teamMembers.some((r) => r.role === "sales_rep" && r.id !== userId) && (
                              <optgroup label="Level 1 • Sales Representatives">
                                {teamMembers
                                  .filter((r) => r.role === "sales_rep" && r.id !== userId)
                                  .map((rep) => (
                                    <option key={rep.id} value={rep.id}>
                                      {rep.fullName} (Sales Rep)
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                            {teamMembers.some((r) => r.role === "super_admin" && r.id !== userId) && (
                              <optgroup label="Level 3 • Super Admin">
                                {teamMembers
                                  .filter((r) => r.role === "super_admin" && r.id !== userId)
                                  .map((rep) => (
                                    <option key={rep.id} value={rep.id}>
                                      {rep.fullName} (Super Admin)
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                          </>
                        )}
                      </select>
                    </div>
                  )}

                  {assignmentMode === "round_robin" && (
                    <p className="text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                      Will distribute {extractedLeads.length} leads equally across all {teamMembers.length} active sales reps.
                    </p>
                  )}
                </div>
              )}

              {/* Live Preview Table */}
              {extractedLeads.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                      Preview ({extractedLeads.length} valid numbers detected)
                    </p>
                    <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                      Ready to import
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                        <tr>
                          <th className="px-3 py-2 text-left">Phone</th>
                          <th className="px-3 py-2 text-left">Name / Company</th>
                          <th className="px-3 py-2 text-left">Service / Vertical</th>
                          <th className="px-3 py-2 text-left">Remark / Deal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.map((lead, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono font-medium text-emerald-800">
                              {lead.phone}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {lead.name || lead.company ? (
                                <span>{[lead.name, lead.company].filter(Boolean).join(" • ")}</span>
                              ) : (
                                <span className="text-gray-400 italic text-[11px]">
                                  — (blank)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-600">
                              {[lead.service, lead.vertical].filter(Boolean).join(" • ") || (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate">
                              {lead.amount ? (
                                <span className="font-semibold text-emerald-700">
                                  ₹{lead.amount.toLocaleString()} ({lead.credits || 0} cr)
                                </span>
                              ) : (
                                lead.remark || <span className="text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {extractedLeads.length > 5 && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      ...and {extractedLeads.length - 5} more numbers detected
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl shrink-0">
          {importing ? (
            <div className="w-full flex items-center justify-center py-1 text-xs font-semibold text-gray-500">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600 mr-2" />
              Do not close window — importing in progress...
            </div>
          ) : result ? (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-xs font-semibold text-gray-700 border border-gray-300 rounded-xl hover:bg-white transition flex items-center gap-1.5 shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5 text-gray-500" />
                Import Another File
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-white transition"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={onImported}
                  className="px-5 py-2 text-xs bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition font-semibold shadow-xs flex items-center gap-1.5"
                >
                  <span>Start Calling Queue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-white transition"
              >
                Cancel
              </button>
              {extractedLeads.length > 0 && (
                <button
                  type="button"
                  onClick={handleImport}
                  className="px-5 py-2 text-xs bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition flex items-center gap-2 font-semibold shadow-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import {extractedLeads.length.toLocaleString()} Leads
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-emerald-100 shadow-2xs">
      <span className="text-gray-600 font-medium">{label}</span>
      <span className={`font-bold ${color}`}>{value}</span>
    </div>
  );
}
