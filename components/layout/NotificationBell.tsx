"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Calendar, Phone, Video, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";

interface TaskItem {
  id: string;
  leadId: string;
  taskType: string;
  scheduledTime: string | null;
  status: string;
  meetingLink: string | null;
  notes: string | null;
  lead?: {
    id?: string;
    phoneNumber?: string;
    contactName?: string | null;
    companyName?: string | null;
  };
  rep?: { fullName: string };
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<{ overdue: TaskItem[]; today: TaskItem[] }>({ overdue: [], today: [] });
  const [readTaskIds, setReadTaskIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load read notification IDs from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("read_agenda_notifications");
      if (stored) {
        setReadTaskIds(new Set(JSON.parse(stored)));
      }
    } catch (_) {}
  }, []);

  async function fetchTasks() {
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) return;
      const data = await res.json();
      setTasks({
        overdue: data.overdue || [],
        today: data.today || [],
      });
    } catch {
      // silently handle
    }
  }

  function markAsRead(taskId: string) {
    const next = new Set(readTaskIds);
    next.add(taskId);
    setReadTaskIds(next);
    try {
      localStorage.setItem("read_agenda_notifications", JSON.stringify(Array.from(next)));
    } catch (_) {}
    toast.success("Notification marked as read");
  }

  function markAllAsRead() {
    const next = new Set(readTaskIds);
    const all = [...tasks.overdue, ...tasks.today];
    all.forEach((t) => next.add(t.id));
    setReadTaskIds(next);
    try {
      localStorage.setItem("read_agenda_notifications", JSON.stringify(Array.from(next)));
    } catch (_) {}
    toast.success("All notifications marked as read");
  }

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 20_000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  async function triggerPushToDial(phoneNumber?: string, leadId?: string, contactName?: string, companyName?: string) {
    if (!phoneNumber) return;
    try {
      const res = await fetch("/api/telephony/push-to-dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, phoneNumber, contactName, companyName }),
      });
      if (res.ok) {
        toast.success(`📲 Dialing ${phoneNumber} on Textora Dialer!`);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to trigger dialer");
      }
    } catch {
      toast.error("Network error triggering call");
    }
  }

  const allActiveTasks = [...tasks.overdue, ...tasks.today];
  const unreadTasks = allActiveTasks.filter(
    (t) => t.status === "pending" && !readTaskIds.has(t.id)
  );
  const pendingCount = unreadTasks.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchTasks();
        }}
        className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
        aria-label="Agenda Reminders & Notifications"
        title="Agenda Notifications & Upcoming Reminders"
      >
        <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
        {pendingCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {pendingCount > 9 ? "9+" : pendingCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200/90 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold text-slate-800 text-sm">Agenda & Reminders</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                  {pendingCount} due
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition cursor-pointer hover:underline"
                  title="Mark all notifications as read"
                >
                  Read All
                </button>
              )}
              <Link
                href="/agenda"
                onClick={() => setIsOpen(false)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1"
              >
                Full Agenda
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {unreadTasks.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-80" />
                <p className="font-medium text-slate-700">All caught up!</p>
                <p className="mt-0.5 text-slate-500">No unread agenda reminders right now.</p>
              </div>
            ) : (
              unreadTasks.map((task) => {
                const targetName =
                  task.lead?.companyName || task.lead?.contactName || task.lead?.phoneNumber || "Scheduled Contact";
                const isOverdue = tasks.overdue.some((o) => o.id === task.id);
                const taskTypeLabel = task.taskType === "product_demo" ? "Demo" : "Callback";

                return (
                  <div key={task.id} className="p-3 hover:bg-slate-50/80 transition flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isOverdue
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}
                          >
                            {isOverdue ? "Overdue" : taskTypeLabel}
                          </span>
                          <span className="text-xs font-semibold text-slate-900 truncate">{targetName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            {task.scheduledTime ? formatDateTime(task.scheduledTime) : "No time set"}
                          </span>
                          {task.rep?.fullName && (
                            <span className="text-[10px] text-slate-700 font-semibold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              Rep: {task.rep.fullName}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => markAsRead(task.id)}
                        className="text-slate-400 hover:text-emerald-600 p-1 rounded-md transition cursor-pointer"
                        title="Mark as read"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-1">
                      {task.lead?.phoneNumber && (
                        <button
                          onClick={() =>
                            triggerPushToDial(
                              task.lead?.phoneNumber,
                              task.leadId,
                              task.lead?.contactName || undefined,
                              task.lead?.companyName || undefined
                            )
                          }
                          className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition shadow-2xs"
                        >
                          <Phone className="w-3 h-3" />
                          Call Now
                        </button>
                      )}
                      {task.meetingLink && (
                        <a
                          href={task.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md transition"
                        >
                          <Video className="w-3 h-3" />
                          Join Meeting
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-2.5 bg-slate-50/80 border-t border-slate-100 text-center">
            <p className="text-[10px] text-slate-400">
              ⚡ Real-time alerts fire 5 min before &amp; at exact scheduled time.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
