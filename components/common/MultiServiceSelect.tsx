"use client";

import { useState } from "react";
import { X, Plus, Tag } from "lucide-react";
import { SERVICE_INTERESTS } from "@/lib/utils";

interface MultiServiceSelectProps {
  selectedServices: string[];
  onChange: (services: string[]) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function MultiServiceSelect({
  selectedServices,
  onChange,
  label = "Interested Services",
  required = false,
  placeholder = "+ Add service...",
  className = "",
  disabled = false,
}: MultiServiceSelectProps) {
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  function handleAdd(service: string) {
    const trimmed = service.trim();
    if (!trimmed) return;
    if (!selectedServices.includes(trimmed)) {
      onChange([...selectedServices, trimmed]);
    }
  }

  function handleRemove(serviceToRemove: string) {
    onChange(selectedServices.filter((s) => s !== serviceToRemove));
  }

  function handleAddCustom() {
    if (customInput.trim()) {
      handleAdd(customInput.trim());
      setCustomInput("");
      setShowCustomInput(false);
    }
  }

  // Available default options that are not yet selected
  const availableOptions = SERVICE_INTERESTS.filter(
    (s) => !selectedServices.includes(s)
  );

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-700 block">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          <span className="text-[10px] text-gray-400">
            {selectedServices.length}{" "}
            {selectedServices.length === 1 ? "service" : "services"} selected
          </span>
        </div>
      )}

      {/* Selected Services Tags */}
      <div className="flex flex-wrap gap-1.5 min-h-[34px] p-2 bg-gray-50/80 border border-gray-200 rounded-lg">
        {selectedServices.map((service) => (
          <span
            key={service}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-100/80 text-emerald-900 border border-emerald-300 shadow-2xs group animate-in fade-in zoom-in-95 duration-100"
          >
            <Tag className="w-3 h-3 text-emerald-700 shrink-0" />
            <span>{service}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => handleRemove(service)}
                className="text-emerald-700 hover:text-rose-600 hover:bg-rose-50 rounded p-0.5 transition"
                title={`Remove ${service}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}

        {selectedServices.length === 0 && (
          <span className="text-xs text-gray-400 italic flex items-center py-0.5">
            No services selected yet. Add one or more below.
          </span>
        )}
      </div>

      {/* Controls: Dropdown + Quick Add */}
      {!disabled && (
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center gap-2">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setShowCustomInput(true);
                } else if (e.target.value) {
                  handleAdd(e.target.value);
                }
              }}
              className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 text-gray-700 cursor-pointer"
            >
              <option value="">{placeholder}</option>
              {availableOptions.map((opt) => (
                <option key={opt} value={opt}>
                  + {opt}
                </option>
              ))}
              <option value="__custom__">+ Other / Custom Service...</option>
            </select>

            {!showCustomInput && (
              <button
                type="button"
                onClick={() => setShowCustomInput(true)}
                className="px-2.5 py-1.5 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg font-medium transition flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3 h-3" />
                Custom
              </button>
            )}
          </div>

          {/* Inline Custom Input */}
          {showCustomInput && (
            <div className="flex items-center gap-2 animate-in fade-in duration-150">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
                placeholder="Type service name (e.g. WhatsApp Bot, Tollfree)..."
                autoFocus
                className="flex-1 px-3 py-1.5 text-xs bg-white border border-emerald-400 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              />
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={!customInput.trim()}
                className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50 transition"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomInput("");
                }}
                className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Quick Click Suggestions */}
          {availableOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <span className="text-[10px] text-gray-400 mr-1">Suggestions:</span>
              {availableOptions.slice(0, 4).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleAdd(s)}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-white hover:bg-emerald-50 text-gray-600 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 transition flex items-center gap-1 font-medium"
                >
                  <Plus className="w-2.5 h-2.5" />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
