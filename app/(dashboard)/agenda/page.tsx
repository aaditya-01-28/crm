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
} from "lucide-react";
import { formatDateTime, cn } from "@/lib/utils";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { LeadDetailModal } from "@/components/leads/LeadDetailModal";

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
  taskType: string;
  scheduledTime: string | null;
  status: string;
  meetingLink: string | null;
  notes: string | null;
  lead: TaskLead;
  rep: { fullName: string };
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
  const notifiedIds = useRef(new Set<string>());
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["agenda"],
    queryFn: fetchAgenda,
    refetchInterval: 60_000, // Refresh every minute
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success("Agenda tasks refreshed ✅");
    } catch {
      toast.error("Failed to refresh agenda");
    }
  };

  // 5-minute pre-notification for today's tasks
  useEffect(() => {
    if (!data?.today) return;
    const now = Date.now();
    const fiveMin = 5 * 60 * 1000;

    data.today.forEach((task) => {
      if (!task.scheduledTime) return;
      const taskTime = new Date(task.scheduledTime).getTime();
      const msBefore = taskTime - now;
      if (msBefore > 0 && msBefore <= fiveMin && !notifiedIds.current.has(task.id)) {
        notifiedIds.current.add(task.id);
        const delay = Math.max(0, msBefore - fiveMin);
        setTimeout(() => {
          toast.warning(
            `⏰ ${task.taskType === "product_demo" ? "Demo" : "Callback"} in 5 min — ${
              task.lead.companyName || task.lead.phoneNumber
            }`,
            { duration: 10000 }
          );
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Textora Engage — Upcoming Task", {
              body: `${task.taskType === "product_demo" ? "Demo" : "Callback"} at ${formatDateTime(
                task.scheduledTime
              )} with ${task.lead.companyName || task.lead.phoneNumber}`,
            });
          }
        }, delay);
      }
    });
  }, [data]);

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

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

  const { unconfirmed = [], overdue = [], today = [], upcoming = [] } = data || {};

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-emerald-600" />
            Follow-Up Agenda
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Callbacks, demos, and scheduled tasks. Click any task to open lead dossier & take action.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-2xs disabled:opacity-50 cursor-pointer"
          title="Refresh Agenda Tasks"
        >
          <RefreshCw
            className={cn("w-3.5 h-3.5", isFetching && "animate-spin text-emerald-600")}
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* Unconfirmed / Pending Date Confirmation */}
      {unconfirmed.length > 0 && (
        <AgendaSection
          title={`Follow-Ups Pending Date Confirmation (${unconfirmed.length})`}
          icon={AlertTriangle}
          iconClass="text-amber-600"
          headerClass="border-amber-300 bg-amber-50"
          tasks={unconfirmed}
          onComplete={(id) => completeMutation.mutate(id)}
          onOpenLead={(leadId) => setSelectedLeadId(leadId)}
        />
      )}

      {/* Overdue */}
      {overdue.length > 0 && (
        <AgendaSection
          title={`Overdue / Missed (${overdue.length})`}
          icon={AlertTriangle}
          iconClass="text-red-500"
          headerClass="border-red-200 bg-red-50"
          tasks={overdue}
          onComplete={(id) => completeMutation.mutate(id)}
          onOpenLead={(leadId) => setSelectedLeadId(leadId)}
        />
      )}

      {/* Today */}
      <AgendaSection
        title={`Today's Schedule (${today.length})`}
        icon={Clock}
        iconClass="text-emerald-600"
        headerClass="border-emerald-200 bg-emerald-50"
        tasks={today}
        onComplete={(id) => completeMutation.mutate(id)}
        onOpenLead={(leadId) => setSelectedLeadId(leadId)}
        emptyMessage="No tasks scheduled for today"
      />

      {/* Upcoming Demos */}
      {upcoming.length > 0 && (
        <AgendaSection
          title={`Upcoming (${upcoming.length})`}
          icon={Video}
          iconClass="text-purple-500"
          headerClass="border-purple-200 bg-purple-50"
          tasks={upcoming}
          onComplete={(id) => completeMutation.mutate(id)}
          onOpenLead={(leadId) => setSelectedLeadId(leadId)}
        />
      )}

      {unconfirmed.length === 0 &&
        overdue.length === 0 &&
        today.length === 0 &&
        upcoming.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <CalendarClock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No pending tasks</p>
            <p className="text-sm">
              Schedule callbacks and demos from the Dialer or Leads Directory
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
    </div>
  );
}

function AgendaSection({
  title,
  icon: Icon,
  iconClass,
  headerClass,
  tasks,
  onComplete,
  onOpenLead,
  emptyMessage,
}: {
  title: string;
  icon: React.ElementType;
  iconClass: string;
  headerClass: string;
  tasks: Task[];
  onComplete: (id: string) => void;
  onOpenLead: (leadId: string) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="mb-6">
      <div
        className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl border ${headerClass}`}
      >
        <Icon className={`w-4 h-4 ${iconClass}`} />
        <h2 className="font-semibold text-sm text-gray-700">{title}</h2>
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b-xl overflow-hidden bg-white">
        {tasks.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-6">
            {emptyMessage || "No tasks"}
          </p>
        ) : (
          tasks.map((task, i) => (
            <TaskRow
              key={task.id}
              task={task}
              onComplete={onComplete}
              onOpenLead={onOpenLead}
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
  onComplete,
  onOpenLead,
  isLast,
}: {
  task: Task;
  onComplete: (id: string) => void;
  onOpenLead: (leadId: string) => void;
  isLast: boolean;
}) {
  const isDemo = task.taskType === "product_demo";
  const targetLeadId = task.leadId || task.lead?.id;

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

        {task.scheduledTime ? (
          <p className="text-xs text-gray-500 mt-1">
            🕒 {formatDateTime(task.scheduledTime)}
          </p>
        ) : (
          <p className="text-xs text-amber-700 font-semibold mt-1 flex items-center gap-1">
            ⚠️ Date & Time: TBD (Client yet to confirm)
          </p>
        )}

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

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onComplete(task.id);
          }}
          className="flex items-center gap-1 text-xs text-green-700 border border-green-200 bg-green-50 px-2.5 py-1.5 rounded-lg hover:bg-green-100 transition shrink-0 font-medium cursor-pointer"
          title="Mark task completed"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Done</span>
        </button>
      </div>
    </div>
  );
}
