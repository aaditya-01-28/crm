"use client";

import React from "react";

interface DateTime12hInputProps {
  value: string; // "YYYY-MM-DDTHH:mm" (24h local string) or ""
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

const HOURS_12 = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

function parseValue(value: string): {
  datePart: string;
  hour12: string;
  minute: string;
  ampm: "AM" | "PM";
} {
  if (!value || !value.includes("T")) {
    return { datePart: "", hour12: "11", minute: "00", ampm: "AM" };
  }
  const [datePart, timePart = "11:00"] = value.split("T");
  const [hStr = "11", mStr = "00"] = timePart.split(":");
  const h24 = parseInt(hStr, 10);
  const min = parseInt(mStr, 10);
  if (isNaN(h24) || isNaN(min)) {
    return { datePart, hour12: "11", minute: "00", ampm: "AM" };
  }
  const ampm: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const h12Num = h24 % 12 === 0 ? 12 : h24 % 12;
  return {
    datePart,
    hour12: h12Num.toString().padStart(2, "0"),
    minute: min.toString().padStart(2, "0"),
    ampm,
  };
}

function buildValue(
  datePart: string,
  hour12: string,
  minute: string,
  ampm: "AM" | "PM"
): string {
  if (!datePart) return "";
  let h24 = parseInt(hour12, 10) % 12;
  if (ampm === "PM") h24 += 12;
  return `${datePart}T${h24.toString().padStart(2, "0")}:${minute}`;
}

function getTodayDateStr(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function DateTime12hInput({
  value,
  onChange,
  disabled = false,
  required = false,
  className = "",
}: DateTime12hInputProps) {
  const { datePart, hour12, minute, ampm } = parseValue(value);

  const handleDateChange = (newDate: string) => {
    if (!newDate) {
      onChange("");
      return;
    }
    onChange(buildValue(newDate, hour12, minute, ampm));
  };

  const handleTimeChange = (newHour12: string, newMinute: string, newAmPm: "AM" | "PM") => {
    const activeDate = datePart || getTodayDateStr();
    onChange(buildValue(activeDate, newHour12, newMinute, newAmPm));
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <input
        type="date"
        value={datePart}
        onChange={(e) => handleDateChange(e.target.value)}
        disabled={disabled}
        required={required}
        className="flex-1 min-w-[130px] px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-600 disabled:cursor-not-allowed"
      />
      <div className="flex items-center gap-1 shrink-0">
        <select
          value={hour12}
          onChange={(e) => handleTimeChange(e.target.value, minute, ampm)}
          disabled={disabled}
          aria-label="Hour (12-hour format)"
          className="px-2 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-600 cursor-pointer"
        >
          {HOURS_12.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="text-xs font-bold text-gray-500">:</span>
        <select
          value={minute}
          onChange={(e) => handleTimeChange(hour12, e.target.value, ampm)}
          disabled={disabled}
          aria-label="Minute"
          className="px-2 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-600 cursor-pointer"
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={ampm}
          onChange={(e) => handleTimeChange(hour12, minute, e.target.value as "AM" | "PM")}
          disabled={disabled}
          aria-label="AM or PM"
          className="px-2 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-600 cursor-pointer"
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}
