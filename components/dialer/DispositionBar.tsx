"use client";

import { useState } from "react";
import { X, Clock, Video, FileText } from "lucide-react";

type DispositionType =
  | "RNR"
  | "Connected"
  | "Callback"
  | "Demo Scheduled"
  | "Demo Done"
  | "Not Interested"
  | "Already Using"
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
}

const DISPOSITIONS: { label: string; type: DispositionType; color: string }[] =
  [
    { label: "RNR", type: "RNR", color: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200" },
    { label: "Connected", type: "Connected", color: "bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200" },
    { label: "Callback", type: "Callback", color: "bg-indigo-100 text-indigo-800 hover:bg-indigo-200 border-indigo-200" },
    { label: "Demo Scheduled", type: "Demo Scheduled", color: "bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-200" },
    { label: "Demo Done", type: "Demo Done", color: "bg-teal-100 text-teal-800 hover:bg-teal-200 border-teal-200" },
    { label: "Not Interested", type: "Not Interested", color: "bg-red-100 text-red-800 hover:bg-red-200 border-red-200" },
    { label: "Already Using", type: "Already Using", color: "bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200" },
    { label: "Invalid", type: "Invalid", color: "bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200" },
  ];

export function DispositionBar({ onDispose, disabled }: DispositionBarProps) {
  const [modal, setModal] = useState<"callback" | "demo" | null>(null);
  const [remark, setRemark] = useState("");
  const [callbackDatetime, setCallbackDatetime] = useState("");
  const [demoDatetime, setDemoDatetime] = useState("");
  const [decisionMakerName, setDecisionMakerName] = useState("");
  const [meetingLink, setMeetingLink] = useState("");

  function handleClick(type: DispositionType) {
    if (type === "Callback") {
      setModal("callback");
    } else if (type === "Demo Scheduled") {
      setModal("demo");
    } else {
      onDispose(type);
    }
  }

  function submitCallback() {
    onDispose("Callback", {
      remark,
      callbackDatetime: callbackDatetime || undefined,
    });
    closeModal();
  }

  function submitDemo() {
    onDispose("Demo Scheduled", {
      remark,
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

  return (
    <>
      {/* Disposition Buttons */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Log Disposition
        </p>
        <div className="flex flex-wrap gap-2">
          {DISPOSITIONS.map((d) => (
            <button
              key={d.type}
              onClick={() => handleClick(d.type)}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-50 disabled:cursor-not-allowed ${d.color}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Callback Modal */}
      {modal === "callback" && (
        <Modal title="Schedule Callback" onClose={closeModal}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  Callback Date & Time
                </span>
                <span className="text-xs text-slate-400 font-normal">
                  (Optional if unconfirmed)
                </span>
              </label>
              <input
                type="datetime-local"
                value={callbackDatetime}
                onChange={(e) => setCallbackDatetime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Leave blank if client hasn't fixed time; it will still appear in your Follow-Up agenda so you don't miss it.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-1">
                <FileText className="w-4 h-4" />
                Remark / Discussion Notes
              </label>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="What was discussed? Next steps..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={submitCallback}
                className="px-4 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition"
              >
                Schedule Callback
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Demo Modal */}
      {modal === "demo" && (
        <Modal title="Schedule Product Demo" onClose={closeModal}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-purple-600" />
                  Demo Date & Time
                </span>
                <span className="text-xs text-slate-400 font-normal">
                  (Optional if unconfirmed)
                </span>
              </label>
              <input
                type="datetime-local"
                value={demoDatetime}
                onChange={(e) => setDemoDatetime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Leave blank if client hasn't confirmed time; it will still appear in your Demo reminders.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
                <span>Decision Maker Name</span>
                <span className="text-xs text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={decisionMakerName}
                onChange={(e) => setDecisionMakerName(e.target.value)}
                placeholder="e.g. Rajesh Kumar"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-1">
                <Video className="w-4 h-4" />
                Meeting Link
              </label>
              <input
                type="url"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://meet.google.com/..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Notes
              </label>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Agenda, product interest..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={submitDemo}
                className="px-4 py-2 text-sm bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition"
              >
                Schedule Demo
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
