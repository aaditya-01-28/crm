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

interface ExtractedLead {
  phone: string;
  name: string;
  company: string;
  vertical: string;
  service: string;
}

interface CSVImporterProps {
  onClose: () => void;
  onImported: () => void;
}

interface ImportResult {
  imported: number;
  duplicates: number;
  invalid: number;
  total: number;
  durationMs?: number;
  message?: string;
}

function cleanCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val).trim();
  // Strip Excel floating numbers like 9876543210.0
  if (str.includes(".") && !str.toLowerCase().includes("e")) {
    str = str.split(".")[0];
  }
  return str;
}

/**
 * Universal matrix parser that handles:
 * 1. CSV/Excel with standard headers (Phone, Name, Company, Vertical, Service)
 * 2. Raw phone numbers in 1st column without any headers
 * 3. Raw phone numbers in 1st column with random headers
 * 4. Partially filled sheets where name and company are empty
 */
function parseRawMatrix(matrix: (string | number)[][]): ExtractedLead[] {
  if (!matrix || matrix.length === 0) return [];

  // Filter out completely empty rows
  const cleanRows = matrix.filter((row) =>
    row && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")
  );

  if (cleanRows.length === 0) return [];

  const firstRow = cleanRows[0].map(cleanCell);

  // Check if first row is a header or if it's already a phone number
  const firstCellDigits = cleanCell(firstRow[0]).replace(/\D/g, "");
  const isFirstRowPhone = firstCellDigits.length >= 10;

  let phoneColIdx = -1;
  let nameColIdx = -1;
  let companyColIdx = -1;
  let verticalColIdx = -1;
  let serviceColIdx = -1;

  let hasHeaders = false;

  if (!isFirstRowPhone) {
    // Attempt to match header keywords
    firstRow.forEach((colName, idx) => {
      const lower = colName.toLowerCase().replace(/[\s_-]/g, "");
      if (
        phoneColIdx === -1 &&
        (lower.includes("phone") ||
          lower.includes("mobile") ||
          lower.includes("contactnumber") ||
          lower.includes("cell") ||
          lower.includes("number") ||
          lower.includes("tel") ||
          lower.includes("msisdn") ||
          lower.includes("calling"))
      ) {
        phoneColIdx = idx;
        hasHeaders = true;
      } else if (
        nameColIdx === -1 &&
        (lower.includes("name") ||
          lower.includes("person") ||
          lower.includes("contactname") ||
          lower.includes("client"))
      ) {
        nameColIdx = idx;
        hasHeaders = true;
      } else if (
        companyColIdx === -1 &&
        (lower.includes("company") ||
          lower.includes("org") ||
          lower.includes("business") ||
          lower.includes("firm") ||
          lower.includes("enterprise"))
      ) {
        companyColIdx = idx;
        hasHeaders = true;
      } else if (
        verticalColIdx === -1 &&
        (lower.includes("vertical") ||
          lower.includes("industry") ||
          lower.includes("category") ||
          lower.includes("sector"))
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
      }
    });
  }

  // If no phone column header detected, default phone to column 0 (1st column)
  if (phoneColIdx === -1) {
    phoneColIdx = 0;
  }

  // If the first row was a valid header, start reading data from row 1, else row 0
  const dataRows = hasHeaders ? cleanRows.slice(1) : cleanRows;

  const leads: ExtractedLead[] = [];

  for (const row of dataRows) {
    let rawPhone = cleanCell(row[phoneColIdx]);

    // If designated phone column is empty in this row, scan other columns for a 10-digit number
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
      leads.push({
        phone: normPhone,
        name: nameColIdx >= 0 ? cleanCell(row[nameColIdx]) : "",
        company: companyColIdx >= 0 ? cleanCell(row[companyColIdx]) : "",
        vertical: verticalColIdx >= 0 ? cleanCell(row[verticalColIdx]) : "",
        service: serviceColIdx >= 0 ? cleanCell(row[serviceColIdx]) : "",
      });
    }
  }

  return leads;
}

export function CSVImporter({ onClose, onImported }: CSVImporterProps) {
  const [extractedLeads, setExtractedLeads] = useState<ExtractedLead[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Progressive UX tracking
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusText, setImportStatusText] = useState("");

  // Assignment configuration
  const [assignmentMode, setAssignmentMode] = useState<"unassigned" | "specific" | "round_robin">("unassigned");
  const [selectedRepId, setSelectedRepId] = useState("");
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; fullName: string; role: string }>>([]);

  // Fetch active reps for assignment
  useEffect(() => {
    async function loadTeam() {
      try {
        const res = await fetch("/api/team");
        if (res.ok) {
          const data = await res.json();
          const reps = (data.users || []).filter((u: { role: string; isActive?: boolean }) => u.role === "sales_rep" && u.isActive !== false);
          setTeamMembers(reps);
          if (reps.length > 0) {
            setSelectedRepId(reps[0].id);
          }
        }
      } catch (e) {
        console.error("Failed to load team for assignment", e);
      }
    }
    loadTeam();
  }, []);

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
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      Papa.parse<(string | number)[]>(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const parsed = parseRawMatrix(results.data as (string | number)[][]);
          setExtractedLeads(parsed);
          if (parsed.length === 0) {
            toast.error("No valid 10-digit phone numbers found in this CSV.");
          } else {
            toast.success(`Found ${parsed.length} valid phone numbers!`);
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
        });
        const parsed = parseRawMatrix(matrix);
        setExtractedLeads(parsed);
        if (parsed.length === 0) {
          toast.error("No valid 10-digit phone numbers found in this Excel file.");
        } else {
          toast.success(`Found ${parsed.length} valid phone numbers!`);
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

        const payload = {
          leads: extractedLeads,
          assignmentMode,
          assignToRepId: assignmentMode === "specific" ? selectedRepId : null,
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
          duplicates: 0,
          invalid: 0,
          total: totalLeads,
          durationMs: 0,
        };

        for (let i = 0; i < totalLeads; i += CHUNK_SIZE) {
          const chunk = extractedLeads.slice(i, i + CHUNK_SIZE);
          const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;

          setImportStatusText(
            `Writing batch ${chunkIndex} of ${totalChunks} (${Math.min(i + CHUNK_SIZE, totalLeads)} / ${totalLeads} leads)...`
          );

          const payload = {
            leads: chunk,
            assignmentMode,
            assignToRepId: assignmentMode === "specific" ? selectedRepId : null,
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
          accumulatedResult.duplicates += data.duplicates || 0;
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
  const assignedRepName = teamMembers.find((r) => r.id === selectedRepId)?.fullName || "Sales Rep";

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
                  </p>
                  <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                    Added to dialer queue
                  </p>
                </div>

                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-amber-700 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      Duplicates
                    </span>
                    <Users className="w-4 h-4" />
                  </div>
                  <p className="text-2xl font-black text-amber-800 font-mono">
                    {result.duplicates.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                    Already in CRM (skipped)
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
                        Select Sales Representative:
                      </label>
                      <select
                        value={selectedRepId}
                        onChange={(e) => setSelectedRepId(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-500 text-gray-800"
                      >
                        {teamMembers.length === 0 ? (
                          <option value="">No active sales reps found</option>
                        ) : (
                          teamMembers.map((rep) => (
                            <option key={rep.id} value={rep.id}>
                              {rep.fullName} (Sales Rep)
                            </option>
                          ))
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
                          <th className="px-3 py-2 text-left">Name</th>
                          <th className="px-3 py-2 text-left">Company</th>
                          <th className="px-3 py-2 text-left">Vertical</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.map((lead, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono font-medium text-emerald-800">
                              {lead.phone}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {lead.name ? (
                                lead.name
                              ) : (
                                <span className="text-gray-400 italic text-[11px]">
                                  — (blank, rep can add)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {lead.company ? (
                                lead.company
                              ) : (
                                <span className="text-gray-400 italic text-[11px]">
                                  — (blank, rep can add)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-600">
                              {lead.vertical || <span className="text-gray-300">—</span>}
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
