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

    try {
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
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Import failed");
        return;
      }
      setResult(data);
      toast.success(`✅ Imported ${data.imported} leads successfully!`);
    } catch {
      toast.error("Network error during import");
    } finally {
      setImporting(false);
    }
  }

  const preview = extractedLeads.slice(0, 5);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto border border-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-slate-900 text-white rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                Import Leads Batch (CSV / Excel)
              </h3>
              <p className="text-[11px] text-slate-300">
                1-click upload cold calling lists into your dialer
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white rounded-lg p-1.5 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
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
          {extractedLeads.length > 0 && !result && (
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

          {/* Live Preview */}
          {extractedLeads.length > 0 && !result && (
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

          {/* Import Result Stats */}
          {result && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Import Completed Successfully!
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <ResultStat label="Newly Imported" value={result.imported} color="text-emerald-700" />
                <ResultStat label="Duplicates (skipped)" value={result.duplicates} color="text-amber-700" />
                <ResultStat label="Invalid format" value={result.invalid} color="text-rose-600" />
                <ResultStat label="Total Processed" value={result.total} color="text-gray-700" />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2.5 justify-end pt-2 border-t border-gray-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
            >
              {result ? "Close" : "Cancel"}
            </button>
            {!result && extractedLeads.length > 0 && (
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-5 py-2 text-xs bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition disabled:opacity-60 flex items-center gap-2 font-semibold shadow-xs"
              >
                {importing ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    Import {extractedLeads.length} Leads
                  </>
                )}
              </button>
            )}
            {result && (
              <button
                onClick={onImported}
                className="px-5 py-2 text-xs bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition font-semibold shadow-xs"
              >
                Start Calling Queue
              </button>
            )}
          </div>
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
