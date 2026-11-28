"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";
import { useSession } from "@/components/layout/SessionProvider";
import { isManagerOrAdmin } from "@/lib/rbac";
import { sanitizeExternalUrl } from "@/lib/url-safety";

// Web Audio API Polyphonic Chime Synthesizer
function playChime(type: "reminder" | "now") {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === "reminder") {
      // 2-tone friendly ascending chime (C5 -> E5)
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(659.25, now + 0.2); // E5
      gain2.gain.setValueAtTime(0.18, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.2);
      osc2.stop(now + 0.6);
    } else {
      // 3-tone high-priority alert chime (D5 -> G5 -> A5)
      const now = ctx.currentTime;
      [
        { freq: 587.33, start: 0, dur: 0.25 }, // D5
        { freq: 783.99, start: 0.18, dur: 0.25 }, // G5
        { freq: 880.0, start: 0.36, dur: 0.45 }, // A5
      ].forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + start);
        gain.gain.setValueAtTime(0.22, now + start);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur);
      });
    }
  } catch {
    // AudioContext blocked or not allowed prior to user interaction
  }
}

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
    businessVertical?: string | null;
  };
  rep?: { fullName?: string };
}

async function triggerPushToDial(phoneNumber: string, leadId?: string, contactName?: string, companyName?: string) {
  if (!phoneNumber) return;
  try {
    const res = await fetch("/api/telephony/push-to-dial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, phoneNumber, contactName, companyName }),
    });
    if (res.ok) {
      toast.success(`📲 Dialing ${phoneNumber} on your paired Textora Dialer mobile phone!`);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Failed to trigger phone call");
    }
  } catch {
    toast.error("Network error triggering call");
  }
}

export function AgendaNotificationListener() {
  const { role } = useSession();
  const canCallFromNotification = !isManagerOrAdmin(role);
  const notified5MinRef = useRef<Set<string>>(new Set());
  const notifiedNowRef = useRef<Set<string>>(new Set());

  // Restore already notified task IDs for today from sessionStorage to avoid repeat alerts on refresh
  useEffect(() => {
    try {
      const todayKey = new Date().toISOString().slice(0, 10);
      const saved5Min = sessionStorage.getItem(`textora_agenda_5min_${todayKey}`);
      if (saved5Min) {
        JSON.parse(saved5Min).forEach((id: string) => notified5MinRef.current.add(id));
      }
      const savedNow = sessionStorage.getItem(`textora_agenda_now_${todayKey}`);
      if (savedNow) {
        JSON.parse(savedNow).forEach((id: string) => notifiedNowRef.current.add(id));
      }
    } catch {}

    // Request native browser notification permission if supported and not yet determined
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function checkReminders() {
      if (isCancelled) return;
      try {
        const res = await fetch("/api/tasks");
        if (!res.ok) return;
        const data = await res.json();
        const tasks: TaskItem[] = [...(data.today || []), ...(data.upcoming || [])];

        const now = Date.now();
        const todayKey = new Date().toISOString().slice(0, 10);

        for (const task of tasks) {
          if (!task.scheduledTime || task.status !== "pending") continue;
          const taskTime = new Date(task.scheduledTime).getTime();
          if (isNaN(taskTime)) continue;

          const diffMs = taskTime - now;
          const targetName = task.lead?.companyName || task.lead?.contactName || task.lead?.phoneNumber || "Scheduled Contact";
          const taskLabel = task.taskType === "product_demo" ? "Product Demo" : "Scheduled Callback";
          const phone = task.lead?.phoneNumber || "";

          // 1. Five-minute reminder notification (between 5m and 0m before scheduled time)
          if (diffMs > 0 && diffMs <= 5 * 60 * 1000) {
            if (!notified5MinRef.current.has(task.id)) {
              notified5MinRef.current.add(task.id);
              try {
                sessionStorage.setItem(
                  `textora_agenda_5min_${todayKey}`,
                  JSON.stringify(Array.from(notified5MinRef.current))
                );
              } catch {}

              playChime("reminder");

              // Toast with actionable buttons
              toast.warning(`⏰ Reminder (in 5 min): ${taskLabel}`, {
                description: `${targetName} scheduled for ${formatDateTime(task.scheduledTime)}`,
                duration: 12000,
                action: canCallFromNotification && phone
                  ? {
                      label: "📞 Push to Dial",
                      onClick: () =>
                        triggerPushToDial(phone, task.leadId, task.lead?.contactName || undefined, task.lead?.companyName || undefined),
                    }
                  : {
                      label: "Open Agenda",
                      onClick: () => {
                        window.location.href = "/agenda";
                      },
                    },
              });

              // Browser native desktop notification
              if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                try {
                  const notif = new Notification(`⏰ 5-Min Reminder: ${taskLabel}`, {
                    body: `${targetName} is scheduled at ${formatDateTime(task.scheduledTime)}${phone ? ` • Phone: ${phone}` : ""}`,
                    icon: "/icon.png",
                    tag: `agenda-5min-${task.id}`,
                  });
                  notif.onclick = () => {
                    window.focus();
                    window.location.href = "/agenda";
                  };
                } catch {}
              }
            }
          }

          // 2. Exact scheduled time notification (between 0 and 3m past scheduled time)
          if (diffMs <= 0 && diffMs >= -3 * 60 * 1000) {
            if (!notifiedNowRef.current.has(task.id)) {
              notifiedNowRef.current.add(task.id);
              try {
                sessionStorage.setItem(
                  `textora_agenda_now_${todayKey}`,
                  JSON.stringify(Array.from(notifiedNowRef.current))
                );
              } catch {}

              playChime("now");

              const safeMeetingLink = sanitizeExternalUrl(task.meetingLink);

              // High-priority Toast
              toast.success(`🔔 Time Now: ${taskLabel}!`, {
                description: `Scheduled right now with ${targetName}`,
                duration: 15000,
                action: safeMeetingLink
                  ? {
                      label: "🎥 Join Meeting",
                      onClick: () => {
                        window.open(safeMeetingLink, "_blank", "noopener,noreferrer");
                      },
                    }
                  : canCallFromNotification && phone
                  ? {
                      label: "📞 Call Now",
                      onClick: () =>
                        triggerPushToDial(phone, task.leadId, task.lead?.contactName || undefined, task.lead?.companyName || undefined),
                    }
                  : {
                      label: "Open Agenda",
                      onClick: () => {
                        window.location.href = "/agenda";
                      },
                    },
              });

              // Browser native desktop notification
              if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                try {
                  const notif = new Notification(`🔔 Scheduled Time Now: ${taskLabel}!`, {
                    body: `Scheduled right now with ${targetName}${phone ? ` • Phone: ${phone}` : ""}`,
                    icon: "/icon.png",
                    tag: `agenda-now-${task.id}`,
                  });
                  notif.onclick = () => {
                    window.focus();
                    if (safeMeetingLink) {
                      window.open(safeMeetingLink, "_blank", "noopener,noreferrer");
                    } else {
                      window.location.href = "/agenda";
                    }
                  };
                } catch {}
              }
            }
          }
        }
      } catch {
        // Silently handle transient network errors
      }
    }

    // Run immediately on mount, then every 20 seconds
    checkReminders();
    const interval = setInterval(checkReminders, 20_000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  return null;
}
