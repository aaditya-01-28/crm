"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Clock,
  Video,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ArrowRight,
  User,
  Calendar,
  PhoneOff,
  PhoneCall,
  CalendarX,
  X,
  Check,
  Phone,
  MessageCircle,
  Filter,
} from "lucide-react";
import { formatDateTime, toUtcIsoString, cn } from "@/lib/utils";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { LeadDetailModal } from "@/components/leads/LeadDetailModal";

import { useSession, useCanAssignLeads } from "@/components/layout/SessionProvider";

interface TaskLead {
  id?: string;
  phoneNumber: string;
  contactName: string | null;
  companyName: string | null;
  businessVertical: string | null;
}

interface Task {
  id: string;
  leadId: string;
  repId?: string;
  taskType: string;
  scheduledTime: string | null;
  status: string;
  meetingLink: string | null;
  notes: string | null;
  lead: TaskLead;
  rep?: { id?: string; fullName: string };
}

interface AgendaData {
  unconfirmed: Task[];
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
}

async function fetchAgenda(): Promise<AgendaData> {
  const res = await fetch("/api/tasks");
  if (!res.ok) throw new Error("Failed to fetch agenda");
  return res.json();
}

export default function AgendaPage() {
  const queryClient = useQueryClient();
  const { userId: currentUserId } = useSession();
  const canFilterAgenda = useCanAssignLeads();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [outcomeTask, setOutcomeTask] = useState<Task | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "product_demo" | "callback">("all");
  const [repFilter, setRepFilter] = useState<string>("all");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["agenda"],
    queryFn: fetchAgenda,
    refetchInterval: 15_000, // Real-time 15s dynamic sync
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success("Agenda tasks refreshed ✅");
    } catch {
      toast.error("Failed to refresh agenda");
    }
  };

  const completeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) throw new Error("Failed to complete task");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Task marked as completed ✅");
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: () => toast.error("Failed to update task"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const {
    unconfirmed: rawUnconfirmed = [],
    overdue: rawOverdue = [],
    today: rawToday = [],
    upcoming: rawUpcoming = [],
  } = data || {};

  // Build unique list of reps for Level 2 & Level 3 filter dropdown
  const allTasks = [...rawUnconfirmed, ...rawOverdue, ...rawToday, ...rawUpcoming];
  const repOptions = Array.from(
    new Map(
      allTasks
        .filter((t) => (t.rep?.id || t.repId) && t.rep?.fullName)
        .map((t) => [t.rep?.id || t.repId!, t.rep!.fullName])
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const applyFilters = (list: Task[]) => {
    if (!canFilterAgenda) return list;
    return list.filter((t) => {
      if (typeFilter !== "all" && t.taskType !== typeFilter) return false;
      if (repFilter !== "all" && (t.rep?.id || t.repId) !== repFilter) return false;
      return true;
    });
  };

  const unconfirmed = applyFilters(rawUnconfirmed);
  const overdue = applyFilters(rawOverdue);
  const today = applyFilters(rawToday);
  const upcoming = applyFilters(rawUpcoming);
  const hasActiveFilter = canFilterAgenda && (typeFilter !== "all" || repFilter !== "all");

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-emerald-600" />
            Follow-Up Agenda
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Callbacks, demos, and scheduled tasks. Click any task to open lead dossier or update outcome.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-2xs disabled:opacity-50 cursor-pointer self-start sm:self-auto"
          title="Refresh Agenda Tasks"
        >
          <RefreshCw
            className={cn("w-3.5 h-3.5", isFetching && "animate-spin text-emerald-600")}
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* Level 2 & Level 3 Filter Bar + Quick Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-xs font-semibold text-emerald-800">Today&apos;s Schedule</span>
            <span className="text-sm font-bold text-emerald-700">{today.length}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-purple-50 border border-purple-200">
            <span className="text-xs font-semibold text-purple-800">Upcoming</span>
            <span className="text-sm font-bold text-purple-700">{upcoming.length}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-red-50 border border-red-200">
            <span className="text-xs font-semibold text-red-800">Overdue / Missed</span>
            <span className="text-sm font-bold text-red-700">{overdue.length}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
            <span className="text-xs font-semibold text-amber-800">Pending Date</span>
            <span className="text-sm font-bold text-amber-700">{unconfirmed.length}</span>
          </div>
        </div>

        {canFilterAgenda && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 mr-1">
                <Filter className="w-3.5 h-3.5 text-emerald-600" />
                Filters:
              </span>

              {/* Type Filter Pills */}
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
                {(
                  [
                    { key: "all", label: "All Types" },
                    { key: "product_demo", label: "Demos Only" },
                    { key: "callback", label: "Callbacks Only" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setTypeFilter(opt.key)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer",
                      typeFilter === opt.key
                        ? "bg-white text-emerald-700 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* User / Rep Filter Dropdown */}
              <select
                value={repFilter}
                onChange={(e) => setRepFilter(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
                aria-label="Filter by User"
              >
                <option value="all">All Users ({repOptions.length})</option>
                {repOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setTypeFilter("all");
                  setRepFilter("all");
                }}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-rose-50 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Primary Row: Today's Schedule + Upcoming Demos & Follow-Ups side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <AgendaSection
          title={`Today's Schedule (${today.length})`}
          icon={Clock}
          iconClass="text-emerald-600"
          headerClass="border-emerald-200 bg-emerald-50"
          tasks={today}
          currentUserId={currentUserId}
          onComplete={(id) => completeMutation.mutate(id)}
          onOpenLead={(leadId) => setSelectedLeadId(leadId)}
          onUpdateOutcome={(task) => setOutcomeTask(task)}
          emptyMessage="No tasks scheduled for today"
        />

        <AgendaSection
          title={`Upcoming Demos & Follow-Ups (${upcoming.length})`}
          icon={Video}
          iconClass="text-purple-500"
          headerClass="border-purple-200 bg-purple-50"
          tasks={upcoming}
          currentUserId={currentUserId}
          onComplete={(id) => completeMutation.mutate(id)}
          onOpenLead={(leadId) => setSelectedLeadId(leadId)}
          onUpdateOutcome={(task) => setOutcomeTask(task)}
          emptyMessage="No upcoming tasks scheduled"
        />
      </div>

      {/* Secondary Row: Overdue + Pending Date Confirmation side-by-side */}
      {(overdue.length > 0 || unconfirmed.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {overdue.length > 0 && (
            <AgendaSection
              title={`Overdue / Missed (${overdue.length})`}
              icon={AlertTriangle}
              iconClass="text-red-500"
              headerClass="border-red-200 bg-red-50"
              tasks={overdue}
              currentUserId={currentUserId}
              onComplete={(id) => completeMutation.mutate(id)}
              onOpenLead={(leadId) => setSelectedLeadId(leadId)}
              onUpdateOutcome={(task) => setOutcomeTask(task)}
            />
          )}

          {unconfirmed.length > 0 && (
            <AgendaSection
              title={`Pending Date Confirmation (${unconfirmed.length})`}
              icon={AlertTriangle}
              iconClass="text-amber-600"
              headerClass="border-amber-300 bg-amber-50"
              tasks={unconfirmed}
              currentUserId={currentUserId}
              onComplete={(id) => completeMutation.mutate(id)}
              onOpenLead={(leadId) => setSelectedLeadId(leadId)}
              onUpdateOutcome={(task) => setOutcomeTask(task)}
            />
          )}
        </div>
      )}

      {unconfirmed.length === 0 &&
        overdue.length === 0 &&
        today.length === 0 &&
        upcoming.length === 0 && (
          <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
            <CalendarClock className="w-10 h-10 mx-auto mb-2.5 opacity-30" />
            <p className="font-medium text-gray-600">
              {hasActiveFilter ? "No tasks match the selected filters" : "No pending tasks"}
            </p>
            <p className="text-sm mt-0.5">
              {hasActiveFilter
                ? "Try clearing the type or user filter above"
                : "Schedule callbacks and demos from the Dialer or Leads Directory"}
            </p>
          </div>
        )}

      {/* Lead Detail Dossier Modal Drawer */}
      {selectedLeadId && (
        <LeadDetailModal
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onLeadUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["agenda"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
            queryClient.invalidateQueries({ queryKey: ["leads-directory"] });
          }}
        />
      )}

      {/* Task Outcome & Reschedule Modal */}
      {outcomeTask && (
        <TaskOutcomeModal
          task={outcomeTask}
          onClose={() => setOutcomeTask(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["agenda"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
            queryClient.invalidateQueries({ queryKey: ["leads-directory"] });
          }}
        />
      )}
    </div>
  );
}

function AgendaSection({
  title,
  icon: Icon,
  iconClass,
  headerClass,
  tasks,
  currentUserId,
  onComplete,
  onOpenLead,
  onUpdateOutcome,
  emptyMessage,
}: {
  title: string;
  icon: React.ElementType;
  iconClass: string;
  headerClass: string;
  tasks: Task[];
  currentUserId?: string;
  onComplete: (id: string) => void;
  onOpenLead: (leadId: string) => void;
  onUpdateOutcome: (task: Task) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
      <div
        className={`flex items-center gap-2 px-4 py-2.5 border-b ${headerClass}`}
      >
        <Icon className={`w-4 h-4 ${iconClass}`} />
        <h2 className="font-semibold text-sm text-gray-700">{title}</h2>
      </div>
      <div className="max-h-[460px] overflow-y-auto">
        {tasks.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">
            {emptyMessage || "No tasks"}
          </p>
        ) : (
          tasks.map((task, i) => (
            <TaskRow
              key={task.id}
              task={task}
              currentUserId={currentUserId}
              onComplete={onComplete}
              onOpenLead={onOpenLead}
              onUpdateOutcome={onUpdateOutcome}
              isLast={i === tasks.length - 1}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  currentUserId,
  onComplete,
  onOpenLead,
  onUpdateOutcome,
  isLast,
}: {
  task: Task;
  currentUserId?: string;
  onComplete: (id: string) => void;
  onOpenLead: (leadId: string) => void;
  onUpdateOutcome: (task: Task) => void;
  isLast: boolean;
}) {
  const isDemo = task.taskType === "product_demo";
  const targetLeadId = task.leadId || task.lead?.id;
  const isOwner = Boolean(
    currentUserId &&
      (task.repId === currentUserId || task.rep?.id === currentUserId)
  );

  return (
    <div
      onClick={() => {
        if (targetLeadId) {
          onOpenLead(targetLeadId);
        }
      }}
      className={cn(
        "flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors group select-none",
        !isLast && "border-b border-gray-100"
      )}
      title="Click to open lead dossier"
    >
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-transform group-hover:scale-105",
          isDemo ? "bg-purple-100" : "bg-blue-100"
        )}
      >
        {isDemo ? (
          <Video className="w-4 h-4 text-purple-600" />
        ) : (
          <Clock className="w-4 h-4 text-blue-600" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-gray-900 text-sm group-hover:text-emerald-700 transition-colors flex items-center gap-2">
              <span>{task.lead.companyName || task.lead.phoneNumber}</span>
              <span className="text-[10px] text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity font-semibold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                Open Lead ↗
              </span>
            </p>
            {task.lead.contactName && (
              <p className="text-xs text-gray-500">{task.lead.contactName}</p>
            )}
          </div>
          <span
            className={cn(
              "text-xs font-semibold px-2 py-0.5 rounded-full shrink-0",
              isDemo
                ? "bg-purple-100 text-purple-700"
                : "bg-blue-100 text-blue-700"
            )}
          >
            {isDemo ? "Demo" : "Callback"}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {task.scheduledTime ? (
            <span className="text-xs text-gray-600 flex items-center gap-1 font-medium">
              🕒 {formatDateTime(task.scheduledTime)}
            </span>
          ) : (
            <span className="text-xs text-amber-700 font-semibold flex items-center gap-1">
              ⚠️ Date & Time: TBD (Client yet to confirm)
            </span>
          )}

          {task.rep?.fullName && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
              <User className="w-3 h-3 text-emerald-600" />
              <span>Assigned: {task.rep.fullName}</span>
            </span>
          )}
        </div>

        {task.notes && (
          <p className="text-xs text-gray-600 mt-1 line-clamp-2">{task.notes}</p>
        )}

        {task.meetingLink && (
          <a
            href={task.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-blue-600 hover:underline mt-1.5 inline-flex items-center gap-1 font-medium"
          >
            🔗 Join Video Meeting
          </a>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (targetLeadId) {
              onOpenLead(targetLeadId);
            }
          }}
          className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-slate-200 px-2.5 py-1.5 rounded-lg transition cursor-pointer"
          title="Open full lead dossier"
        >
          <span>Action</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        {isOwner ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateOutcome(task);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 border border-emerald-200 px-3 py-1.5 rounded-lg transition shrink-0 cursor-pointer shadow-2xs"
              title="Update status, reschedule or mark customer not answering"
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>Update Outcome</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onComplete(task.id);
              }}
              className="flex items-center gap-1 text-xs text-slate-700 border border-slate-200 bg-slate-50 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition shrink-0 font-medium cursor-pointer"
              title="Quick mark completed"
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden md:inline">Done</span>
            </button>
          </>
        ) : (
          <span
            className="inline-flex items-center text-[11px] text-slate-400 font-medium px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg shrink-0"
            title="Read-only: Only assigned representative can complete or update this task"
          >
            Read Only
          </span>
        )}
      </div>
    </div>
  );
}

function TaskOutcomeModal({
  task,
  onClose,
  onSuccess,
}: {
  task: Task | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isDemo = task?.taskType === "product_demo";
  const [outcome, setOutcome] = useState<"completed" | "rnr" | "reschedule" | "not_interested">("completed");
  const [scheduledDatetime, setScheduledDatetime] = useState("");
  const [remark, setRemark] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (task) {
      setOutcome("completed");
      setScheduledDatetime("");
      setRemark("");
    }
  }, [task]);

  if (!task) return null;

  function setPresetMinutes(minutesFromNow: number) {
    const d = new Date();
    d.setMinutes(d.getMinutes() + minutesFromNow);
    d.setSeconds(0, 0);
    const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setScheduledDatetime(isoLocal);
  }

  function setPresetTime(hoursFromNow: number) {
    const d = new Date();
    d.setHours(d.getHours() + hoursFromNow);
    d.setMinutes(0, 0, 0);
    const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setScheduledDatetime(isoLocal);
  }

  function setTomorrowTime(hour: number) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setScheduledDatetime(isoLocal);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    setIsSubmitting(true);
    try {
      let finalAction: string = outcome;
      if (outcome === "completed" && isDemo) {
        finalAction = "demo_done";
      }

      // Convert local browser datetime to exact UTC ISO string to prevent timezone offset shifts
      const utcTime = scheduledDatetime ? toUtcIsoString(scheduledDatetime) : null;

      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: finalAction,
          status: outcome === "completed" || outcome === "not_interested" ? "completed" : "pending",
          scheduledTime: utcTime,
          remark: remark.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update agenda task");
      }

      toast.success(
        outcome === "rnr"
          ? "RNR recorded: Customer Not Answering logged & retry callback scheduled ✅"
          : outcome === "reschedule"
          ? `${isDemo ? "Demo" : "Callback"} rescheduled successfully 📅`
          : outcome === "completed"
          ? `${isDemo ? "Demo marked Done & post-demo follow-up scheduled" : "Task marked completed"} ✅`
          : "Task closed as Not Interested"
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update task");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-gray-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isDemo ? "bg-purple-500/20 text-purple-300 border border-purple-400/30" : "bg-blue-500/20 text-blue-300 border border-blue-400/30"
              }`}>
                {isDemo ? "Product Demo" : "Callback Task"}
              </span>
              <h3 className="font-bold text-sm text-white">
                Update Meeting Outcome
              </h3>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              {task.lead.companyName || task.lead.contactName || task.lead.phoneNumber} • {task.lead.phoneNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Outcome Choice Grid */}
          <div>
            <label className="font-bold text-gray-800 block mb-2 text-xs uppercase tracking-wider">
              Select What Happened:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Option 1: Done */}
              <div
                onClick={() => setOutcome("completed")}
                className={`p-3 rounded-xl border cursor-pointer transition select-none flex items-start gap-2.5 ${
                  outcome === "completed"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs"
                    : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700"
                }`}
              >
                <CheckCircle className={`w-4 h-4 shrink-0 mt-0.5 ${outcome === "completed" ? "text-emerald-600" : "text-gray-400"}`} />
                <div>
                  <span className="font-bold block text-xs">
                    {isDemo ? "Demo Completed ✅" : "Callback Completed ✅"}
                  </span>
                  <span className="text-[11px] text-gray-500 leading-tight block mt-0.5">
                    {isDemo ? "Walkthrough finished with client" : "Spoke with client, resolved"}
                  </span>
                </div>
              </div>

              {/* Option 2: Customer Not Picking / RNR */}
              <div
                onClick={() => setOutcome("rnr")}
                className={`p-3 rounded-xl border cursor-pointer transition select-none flex items-start gap-2.5 ${
                  outcome === "rnr"
                    ? "bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-500/20 shadow-xs"
                    : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700"
                }`}
              >
                <PhoneOff className={`w-4 h-4 shrink-0 mt-0.5 ${outcome === "rnr" ? "text-amber-600" : "text-gray-400"}`} />
                <div>
                  <span className="font-bold block text-xs">
                    Not Picking Up / RNR 📵
                  </span>
                  <span className="text-[11px] text-gray-500 leading-tight block mt-0.5">
                    No answer on call or WhatsApp
                  </span>
                </div>
              </div>

              {/* Option 3: Rescheduled */}
              <div
                onClick={() => setOutcome("reschedule")}
                className={`p-3 rounded-xl border cursor-pointer transition select-none flex items-start gap-2.5 ${
                  outcome === "reschedule"
                    ? "bg-blue-50 border-blue-500 text-blue-900 ring-2 ring-blue-500/20 shadow-xs"
                    : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700"
                }`}
              >
                <Calendar className={`w-4 h-4 shrink-0 mt-0.5 ${outcome === "reschedule" ? "text-blue-600" : "text-gray-400"}`} />
                <div>
                  <span className="font-bold block text-xs">
                    Reschedule Meeting 📅
                  </span>
                  <span className="text-[11px] text-gray-500 leading-tight block mt-0.5">
                    Customer requested another time
                  </span>
                </div>
              </div>

              {/* Option 4: Not Interested / Cancelled */}
              <div
                onClick={() => setOutcome("not_interested")}
                className={`p-3 rounded-xl border cursor-pointer transition select-none flex items-start gap-2.5 ${
                  outcome === "not_interested"
                    ? "bg-rose-50 border-rose-500 text-rose-900 ring-2 ring-rose-500/20 shadow-xs"
                    : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700"
                }`}
              >
                <CalendarX className={`w-4 h-4 shrink-0 mt-0.5 ${outcome === "not_interested" ? "text-rose-600" : "text-gray-400"}`} />
                <div>
                  <span className="font-bold block text-xs">
                    Not Interested / Cancelled ❌
                  </span>
                  <span className="text-[11px] text-gray-500 leading-tight block mt-0.5">
                    Declined demo or closed requirement
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Conditional Date / Time Pickers */}
          {outcome === "rnr" && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-amber-900 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Reschedule Retry Callback Date & Time
                </label>
                <span className="text-[11px] text-slate-500 font-normal">
                  (Optional retry time)
                </span>
              </div>
              <input
                type="datetime-local"
                value={scheduledDatetime}
                onChange={(e) => setScheduledDatetime(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-amber-500 outline-none text-gray-900"
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-gray-400 font-medium">Quick Retry:</span>
                <button
                  type="button"
                  onClick={() => setPresetMinutes(25)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 text-[10px] font-semibold text-gray-700 hover:text-amber-800 border border-gray-200 transition cursor-pointer"
                >
                  +25 Min
                </button>
                <button
                  type="button"
                  onClick={() => setPresetTime(1)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 text-[10px] font-semibold text-gray-700 hover:text-amber-800 border border-gray-200 transition cursor-pointer"
                >
                  +1 Hour
                </button>
                <button
                  type="button"
                  onClick={() => setPresetTime(2)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 text-[10px] font-semibold text-gray-700 hover:text-amber-800 border border-gray-200 transition cursor-pointer"
                >
                  +2 Hours
                </button>
                <button
                  type="button"
                  onClick={() => setTomorrowTime(11)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 text-[10px] font-semibold text-gray-700 hover:text-amber-800 border border-gray-200 transition cursor-pointer"
                >
                  Tomorrow 11 AM
                </button>
                <button
                  type="button"
                  onClick={() => setTomorrowTime(16)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 text-[10px] font-semibold text-gray-700 hover:text-amber-800 border border-gray-200 transition cursor-pointer"
                >
                  Tomorrow 4 PM
                </button>
              </div>
              <p className="text-[11px] text-gray-500">
                💡 RNR will be recorded in lead history. If retry time is left blank, it stays in &quot;Pending Date Confirmation&quot; so you can follow up later.
              </p>
            </div>
          )}

          {outcome === "reschedule" && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-blue-900 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  New {isDemo ? "Demo" : "Callback"} Date & Time <span className="text-red-500">*</span>
                </label>
              </div>
              <input
                type="datetime-local"
                value={scheduledDatetime}
                onChange={(e) => setScheduledDatetime(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none text-gray-900"
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-gray-400 font-medium">Quick Reschedule:</span>
                <button
                  type="button"
                  onClick={() => setPresetMinutes(25)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-blue-100 text-[10px] font-semibold text-gray-700 hover:text-blue-800 border border-gray-200 transition cursor-pointer"
                >
                  +25 Min
                </button>
                <button
                  type="button"
                  onClick={() => setPresetTime(1)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-blue-100 text-[10px] font-semibold text-gray-700 hover:text-blue-800 border border-gray-200 transition cursor-pointer"
                >
                  +1 Hour
                </button>
                <button
                  type="button"
                  onClick={() => setPresetTime(2)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-blue-100 text-[10px] font-semibold text-gray-700 hover:text-blue-800 border border-gray-200 transition cursor-pointer"
                >
                  +2 Hours
                </button>
                <button
                  type="button"
                  onClick={() => setTomorrowTime(11)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-blue-100 text-[10px] font-semibold text-gray-700 hover:text-blue-800 border border-gray-200 transition cursor-pointer"
                >
                  Tomorrow 11 AM
                </button>
                <button
                  type="button"
                  onClick={() => setTomorrowTime(16)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-blue-100 text-[10px] font-semibold text-gray-700 hover:text-blue-800 border border-gray-200 transition cursor-pointer"
                >
                  Tomorrow 4 PM
                </button>
              </div>
            </div>
          )}

          {outcome === "completed" && isDemo && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-emerald-900 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  Post-Demo Follow-Up Callback (Optional)
                </label>
                <span className="text-[11px] text-slate-500 font-normal">
                  (Closing callback)
                </span>
              </div>
              <input
                type="datetime-local"
                value={scheduledDatetime}
                onChange={(e) => setScheduledDatetime(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none text-gray-900"
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-gray-400 font-medium">Quick Preset:</span>
                <button
                  type="button"
                  onClick={() => setPresetMinutes(25)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-emerald-100 text-[10px] font-semibold text-gray-700 hover:text-emerald-800 border border-gray-200 transition cursor-pointer"
                >
                  +25 Min
                </button>
                <button
                  type="button"
                  onClick={() => setPresetTime(1)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-emerald-100 text-[10px] font-semibold text-gray-700 hover:text-emerald-800 border border-gray-200 transition cursor-pointer"
                >
                  +1 Hour
                </button>
                <button
                  type="button"
                  onClick={() => setPresetTime(2)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-emerald-100 text-[10px] font-semibold text-gray-700 hover:text-emerald-800 border border-gray-200 transition cursor-pointer"
                >
                  +2 Hours
                </button>
                <button
                  type="button"
                  onClick={() => setTomorrowTime(11)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-emerald-100 text-[10px] font-semibold text-gray-700 hover:text-emerald-800 border border-gray-200 transition cursor-pointer"
                >
                  Tomorrow 11 AM
                </button>
                <button
                  type="button"
                  onClick={() => setTomorrowTime(16)}
                  className="px-2 py-0.5 rounded bg-white hover:bg-emerald-100 text-[10px] font-semibold text-gray-700 hover:text-emerald-800 border border-gray-200 transition cursor-pointer"
                >
                  Tomorrow 4 PM
                </button>
              </div>
              <p className="text-[11px] text-gray-500">
                💡 A post-demo follow-up callback will be placed in your Agenda so you never miss calling back to close the deal.
              </p>
            </div>
          )}

          {/* Notes / Remark */}
          <div>
            <label className="font-semibold text-gray-700 block mb-1">
              Discussion Notes & Reasons
            </label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={2}
              placeholder={
                outcome === "rnr"
                  ? "e.g. Called 2 times, sent WhatsApp reminder, no response..."
                  : outcome === "reschedule"
                  ? "e.g. Client busy in meeting, asked to connect tomorrow at 11 AM..."
                  : outcome === "completed"
                  ? "e.g. Walkthrough completed, showed WhatsApp catalog, client interested in 50k SMS pack..."
                  : "e.g. Pricing high, not needed at this moment..."
              }
              className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save & Update Agenda</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
