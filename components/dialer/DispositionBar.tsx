"use client";

import { useState } from "react";
import {
  Clock,
  Video,
  FileText,
  X,
  CheckCircle,
  CalendarPlus,
  PhoneOff,
  Sparkles,
  Check,
  Calendar,
  AlertCircle,
} from "lucide-react";

type DispositionType =
  | "RNR"
  | "Connected"
  | "Callback"
  | "Demo Scheduled"
  | "Demo Done"
  | "Not Interested"
  | "Already Using Our Service"
  | "Already Purchased or Using Other Company Service"
  | "Future Requirement"
  | "Invalid";

interface DispositionBarProps {
  onDispose: (
    disposition: string,
    extra?: {
      remark?: string;
      callbackDatetime?: string;
      demoDatetime?: string;
      decisionMakerName?: string;
      meetingLink?: string;
    }
  ) => void;
  disabled?: boolean;
  leadId: string;
  quickNote?: string;
}

export function DispositionBar({
  onDispose,
  disabled,
  leadId,
  quickNote = "",
}: DispositionBarProps) {
  const [modal, setModal] = useState<"callback" | "demo" | null>(null);
  const [remark, setRemark] = useState("");
  const [callbackDatetime, setCallbackDatetime] = useState("");
  const [demoDatetime, setDemoDatetime] = useState("");
  const [decisionMakerName, setDecisionMakerName] = useState("");
  const [meetingLink, setMeetingLink] = useState("");

  function handleClick(type: DispositionType) {
    if (type === "Callback") {
      setRemark(quickNote);
      setModal("callback");
    } else if (type === "Demo Scheduled") {
      setRemark(quickNote);
      setModal("demo");
    } else {
      const extra = quickNote.trim() ? { remark: quickNote.trim() } : undefined;
      onDispose(type, extra);
    }
  }

  function submitCallback() {
    onDispose("Callback", {
      remark: [quickNote.trim(), remark.trim()].filter(Boolean).join(" • ") || undefined,
      callbackDatetime: callbackDatetime || undefined,
    });
    closeModal();
  }

  function submitDemo() {
    onDispose("Demo Scheduled", {
      remark: [quickNote.trim(), remark.trim()].filter(Boolean).join(" • ") || undefined,
      demoDatetime: demoDatetime || undefined,
      decisionMakerName: decisionMakerName || undefined,
      meetingLink: meetingLink || undefined,
    });
    closeModal();
  }

  function closeModal() {
    setModal(null);
    setRemark("");
    setCallbackDatetime("");
    setDemoDatetime("");
    setDecisionMakerName("");
    setMeetingLink("");
  }

  function setPresetTime(hoursFromNow: number) {
    const d = new Date();
    d.setHours(d.getHours() + hoursFromNow);
    d.setMinutes(0, 0, 0);
    const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    if (modal === "callback") setCallbackDatetime(isoLocal);
    if (modal === "demo") setDemoDatetime(isoLocal);
  }

  function setTomorrowTime(hour: number) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    if (modal === "callback") setCallbackDatetime(isoLocal);
    if (modal === "demo") setDemoDatetime(isoLocal);
  }

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
          <span>Record Call Disposition</span>
        </div>
        <span className="text-[11px] text-gray-400">Clicking logs outcome & auto-advances</span>
      </div>

      {/* Group 1: Connected & Positive Outcomes */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1.5">
          Connected & Positive Outcomes
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleClick("Connected")}
            disabled={disabled}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Connected</span>
          </button>

          <button
            type="button"
            onClick={() => handleClick("Demo Scheduled")}
            disabled={disabled}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Demo Scheduled ✨</span>
          </button>

          <button
            type="button"
            onClick={() => handleClick("Demo Done")}
            disabled={disabled}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Demo Done</span>
          </button>
        </div>
      </div>

      {/* Group 2: Follow-Up & Pipeline Progression */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1.5">
          Follow-Up & Pipeline Progression
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleClick("Callback")}
            disabled={disabled}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            <CalendarPlus className="w-3.5 h-3.5 text-indigo-600" />
            <span>Callback (Schedule)</span>
          </button>

          <button
            type="button"
            onClick={() => handleClick("Future Requirement")}
            disabled={disabled}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-sky-600" />
            <span>Future Requirement</span>
          </button>
        </div>
      </div>

      {/* Group 3: Unanswered / Disqualified */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
          Unanswered / Disqualified
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleClick("RNR")}
            disabled={disabled}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            <PhoneOff className="w-3.5 h-3.5 text-amber-600" />
            <span>RNR (No Answer)</span>
          </button>

          <button
            type="button"
            onClick={() => handleClick("Not Interested")}
            disabled={disabled}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-rose-600" />
            <span>Not Interested</span>
          </button>

          <button
            type="button"
            onClick={() => handleClick("Already Using Our Service")}
            disabled={disabled}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-all disabled:opacity-50 cursor-pointer"
          >
            Already Using
          </button>

          <button
            type="button"
            onClick={() => handleClick("Already Purchased or Using Other Company Service")}
            disabled={disabled}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 transition-all disabled:opacity-50 cursor-pointer"
          >
            Already with Competitor
          </button>

          <button
            type="button"
            onClick={() => handleClick("Invalid")}
            disabled={disabled}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 transition-all disabled:opacity-50 cursor-pointer"
          >
            Invalid / Wrong
          </button>
        </div>
      </div>

      {/* Callback Scheduling Modal */}
      {modal === "callback" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-gray-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-indigo-100" />
                <h3 className="font-bold text-sm">Schedule Prospect Callback</h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Callback Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={callbackDatetime}
                  onChange={(e) => setCallbackDatetime(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-gray-400">Quick:</span>
                  <button
                    type="button"
                    onClick={() => setPresetTime(2)}
                    className="px-2 py-0.5 rounded bg-gray-100 hover:bg-indigo-50 text-[10px] font-semibold text-gray-700 hover:text-indigo-700 border border-gray-200 transition cursor-pointer"
                  >
                    +2 Hours
                  </button>
                  <button
                    type="button"
                    onClick={() => setTomorrowTime(11)}
                    className="px-2 py-0.5 rounded bg-gray-100 hover:bg-indigo-50 text-[10px] font-semibold text-gray-700 hover:text-indigo-700 border border-gray-200 transition cursor-pointer"
                  >
                    Tomorrow 11 AM
                  </button>
                  <button
                    type="button"
                    onClick={() => setTomorrowTime(16)}
                    className="px-2 py-0.5 rounded bg-gray-100 hover:bg-indigo-50 text-[10px] font-semibold text-gray-700 hover:text-indigo-700 border border-gray-200 transition cursor-pointer"
                  >
                    Tomorrow 4 PM
                  </button>
                </div>
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Follow-up Notes / Reason
                </label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={3}
                  placeholder="e.g. Client requested callback after checking with decision maker..."
                  className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitCallback}
                  className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition cursor-pointer"
                >
                  Save Callback & Advance
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Demo Scheduling Modal */}
      {modal === "demo" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-gray-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-purple-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-100" />
                <h3 className="font-bold text-sm">Schedule Product Demo</h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Demo Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={demoDatetime}
                  onChange={(e) => setDemoDatetime(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Decision Maker Name & Title
                </label>
                <input
                  type="text"
                  value={decisionMakerName}
                  onChange={(e) => setDecisionMakerName(e.target.value)}
                  placeholder="e.g. Mr. Sharma (Managing Director)"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Meeting Link (Google Meet / Zoom)
                </label>
                <input
                  type="url"
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Demo Discussion Points
                </label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={2}
                  placeholder="e.g. Needs WhatsApp Green Tick walkthrough & Shopify webhook demo..."
                  className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitDemo}
                  className="px-4 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-sm transition cursor-pointer"
                >
                  Schedule Demo & Advance
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
