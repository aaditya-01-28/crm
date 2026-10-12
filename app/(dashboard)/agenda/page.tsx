"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock, Video, AlertTriangle, CheckCircle } from "lucide-react";
import { formatDateTime, cn } from "@/lib/utils";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

interface TaskLead {
  phoneNumber: string;
  contactName: string | null;
  companyName: string | null;
  businessVertical: string | null;
}

interface Task {
  id: string;
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

  const { data, isLoading } = useQuery({
    queryKey: ["agenda"],
    queryFn: fetchAgenda,
    refetchInterval: 60_000, // Refresh every minute
  });

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
            `⏰ ${task.taskType === "product_demo" ? "Demo" : "Callback"} in 5 min — ${task.lead.companyName || task.lead.phoneNumber}`,
            { duration: 10000 }
          );
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Textora Engage — Upcoming Task", {
              body: `${task.taskType === "product_demo" ? "Demo" : "Callback"} at ${formatDateTime(task.scheduledTime)} with ${task.lead.companyName || task.lead.phoneNumber}`,
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
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-emerald-600" />
          Follow-Up Agenda
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Callbacks, demos, and scheduled tasks
        </p>
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
        />
      )}

      {unconfirmed.length === 0 && overdue.length === 0 && today.length === 0 && upcoming.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <CalendarClock className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No pending tasks</p>
          <p className="text-sm">Schedule callbacks and demos from the Dialer or Leads Directory</p>
        </div>
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
  emptyMessage,
}: {
  title: string;
  icon: React.ElementType;
  iconClass: string;
  headerClass: string;
  tasks: Task[];
  onComplete: (id: string) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="mb-6">
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl border ${headerClass}`}>
        <Icon className={`w-4 h-4 ${iconClass}`} />
        <h2 className="font-semibold text-sm text-gray-700">{title}</h2>
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b-xl overflow-hidden bg-white">
        {tasks.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-6">{emptyMessage || "No tasks"}</p>
        ) : (
          tasks.map((task, i) => (
            <TaskRow
              key={task.id}
              task={task}
              onComplete={onComplete}
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
  isLast,
}: {
  task: Task;
  onComplete: (id: string) => void;
  isLast: boolean;
}) {
  const isDemo = task.taskType === "product_demo";
  return (
    <div className={cn("flex items-start gap-4 px-5 py-4", !isLast && "border-b border-gray-100")}>
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
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
            <p className="font-semibold text-gray-800 text-sm">
              {task.lead.companyName || task.lead.phoneNumber}
            </p>
            {task.lead.contactName && (
              <p className="text-xs text-gray-500">{task.lead.contactName}</p>
            )}
          </div>
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full shrink-0",
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
            🕐 {formatDateTime(task.scheduledTime)}
          </p>
        ) : (
          <p className="text-xs text-amber-700 font-semibold mt-1 flex items-center gap-1">
            ⚠️ Date & Time: TBD (Client yet to confirm)
          </p>
        )}

        {task.notes && (
          <p className="text-xs text-gray-600 mt-1 truncate">{task.notes}</p>
        )}

        {task.meetingLink && (
          <a
            href={task.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline mt-1 block"
          >
            🔗 Join Meeting
          </a>
        )}
      </div>

      <button
        onClick={() => onComplete(task.id)}
        className="flex items-center gap-1 text-xs text-green-600 border border-green-200 bg-green-50 px-2.5 py-1.5 rounded-lg hover:bg-green-100 transition shrink-0"
      >
        <CheckCircle className="w-3.5 h-3.5" />
        Done
      </button>
    </div>
  );
}
