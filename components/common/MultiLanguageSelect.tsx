"use client";

import { X, Plus, Languages } from "lucide-react";
import { LEAD_LANGUAGES, getLanguageMeta } from "@/lib/utils";

interface MultiLanguageSelectProps {
  selectedLanguages: string[];
  onChange: (languages: string[]) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function MultiLanguageSelect({
  selectedLanguages,
  onChange,
  label = "Preferred Languages",
  required = false,
  placeholder = "+ Add language...",
  className = "",
  disabled = false,
}: MultiLanguageSelectProps) {
  function handleAdd(langCodeOrName: string) {
    const trimmed = langCodeOrName.trim();
    if (!trimmed) return;
    if (!selectedLanguages.includes(trimmed)) {
      onChange([...selectedLanguages, trimmed]);
    }
  }

  function handleRemove(langToRemove: string) {
    onChange(selectedLanguages.filter((l) => l !== langToRemove));
  }

  // Available default options that are not yet selected
  const availableOptions = LEAD_LANGUAGES.filter(
    (l) =>
      !selectedLanguages.includes(l.code) &&
      !selectedLanguages.includes(l.label) &&
      !selectedLanguages.includes(l.label.split(" ")[0])
  );

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-700 block">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          <span className="text-[10px] text-gray-400">
            {selectedLanguages.length}{" "}
            {selectedLanguages.length === 1 ? "language" : "languages"} selected
          </span>
        </div>
      )}

      {/* Selected Language Tags */}
      <div className="flex flex-wrap gap-1.5 min-h-[34px] p-2 bg-gray-50/80 border border-gray-200 rounded-lg">
        {selectedLanguages.map((lang) => {
          const meta = getLanguageMeta(lang);
          const displayLabel = meta ? `${meta.flag} ${meta.label.split(" (")[0]}` : lang;
          return (
            <span
              key={lang}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-100/80 text-indigo-900 border border-indigo-300 shadow-2xs group animate-in fade-in zoom-in-95 duration-100"
            >
              <Languages className="w-3 h-3 text-indigo-700 shrink-0" />
              <span>{displayLabel}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(lang)}
                  className="text-indigo-700 hover:text-rose-600 hover:bg-rose-50 rounded p-0.5 transition"
                  title={`Remove ${lang}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          );
        })}

        {selectedLanguages.length === 0 && (
          <span className="text-xs text-gray-400 italic flex items-center py-0.5">
            No languages selected yet. Add from the dropdown below.
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
                if (e.target.value) {
                  handleAdd(e.target.value);
                }
              }}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 cursor-pointer shadow-2xs"
            >
              <option value="">{placeholder}</option>
              {availableOptions.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.flag} + {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Click Suggestions */}
          {availableOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <span className="text-[10px] text-gray-400 mr-1">Suggestions:</span>
              {availableOptions.slice(0, 5).map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => handleAdd(l.code)}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-white hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 border border-gray-200 hover:border-indigo-200 transition flex items-center gap-1 font-medium shadow-2xs"
                >
                  <Plus className="w-2.5 h-2.5" />
                  {l.flag} {l.label.split(" (")[0]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
