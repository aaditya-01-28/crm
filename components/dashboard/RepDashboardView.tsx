"use client";

import React from "react";
import Link from "next/link";
import {
  PhoneCall,
  Phone,
  Clock,
  Calendar,
  DollarSign,
  TrendingUp,
  MessageCircle,
  Play,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Building2,
  User,
} from "lucide-react";
import { KpiCard } from "./KpiCard";
import { formatCurrency, formatDateTime, buildTelLink, buildWALink, WA_PITCH } from "@/lib/utils";

interface RepDashboardViewProps {
  metrics: any;
  period: "today" | "week" | "month";
}

export function RepDashboardView({ metrics, period }: RepDashboardViewProps) {
  const {
    queueRemainingCount = 0,
    totalCalls = 0,
    connectedCalls = 0,
    connectRate = 0,
    talkTimeMins = 0,
    todayCallbacksCount = 0,
    todayDemosCount = 0,
    overdueTasksCount = 0,
    activeDealsCount = 0,
    activePipelineValue = 0,
    wonDealsCount = 0,
    wonRevenueInPeriod = 0,
    dispositionMap = {},
    todayAgenda = [],
    recentDeals = [],
    recentCalls = [],
  } = metrics || {};

  const periodLabel = period === "today" ? "Today" : period === "week" ? "This Week" : "This Month";

  return (
    <div className="space-y-6">
      {/* 🚀 Hero Action Banner — Fast Call Console Trigger */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-2 relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Active Calling Console
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Ready to call your leads?
          </h2>
          <p className="text-sm text-slate-300">
            You currently have <strong className="text-emerald-400 font-bold">{queueRemainingCount} assigned leads</strong> waiting in your dialer queue.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <Link
            href="/dialer"
            className="flex items-center gap-2.5 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-sm transition shadow-lg shadow-emerald-900/40 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Play className="w-4 h-4 fill-white" />
            Resume Calling Queue
          </Link>
          <Link
            href="/agenda"
            className="flex items-center gap-2 px-4 py-3.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-2xl font-semibold text-sm transition border border-slate-700"
          >
            <Calendar className="w-4 h-4 text-emerald-400" />
            View Agenda
          </Link>
        </div>
      </div>

      {/* 📊 Key Performance Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Queue Pending"
          value={queueRemainingCount}
          subValue="Leads ready to call"
          icon={PhoneCall}
          color="emerald"
          badge="Direct Dialer"
        />

        <KpiCard
          label={`Calls ${periodLabel}`}
          value={totalCalls}
          subValue={`${connectedCalls} connected (${connectRate}% pickup)`}
          icon={Phone}
          color="blue"
          badge={`Talk Time: ${talkTimeMins} mins`}
        />

        <KpiCard
          label="Callbacks & Demos"
          value={todayCallbacksCount + todayDemosCount}
          subValue={
            overdueTasksCount > 0
              ? `⚠️ ${overdueTasksCount} overdue follow-up(s)`
              : "All follow-ups on track"
          }
          icon={Calendar}
          color={overdueTasksCount > 0 ? "rose" : "amber"}
          badge={`${todayDemosCount} Demos Scheduled`}
        />

        <KpiCard
          label={`Won Revenue (${periodLabel})`}
          value={formatCurrency(wonRevenueInPeriod)}
          subValue={`${wonDealsCount} deal(s) closed won`}
          icon={DollarSign}
          color="purple"
          badge={`Pipeline in Play: ${formatCurrency(activePipelineValue)}`}
        />
      </div>

      {/* 2-Column Operational Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Today's Actionable Agenda & Pipeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Today's Agenda & Callbacks Checklist */}
          <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  Today's Scheduled Tasks & Callbacks
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  High-priority meetings and promised callbacks scheduled for today
                </p>
              </div>
              <Link
                href="/agenda"
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-5">
              {todayAgenda.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500/60" />
                  <p className="text-sm font-semibold text-gray-700">No pending follow-ups for today!</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Good job! Focus on calling fresh leads in your dialer queue.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {todayAgenda.map((task: any) => {
                    const telLink = buildTelLink(task.lead?.phoneNumber || "");
                    const waLink = buildWALink(task.lead?.phoneNumber || "", WA_PITCH);

                    return (
                      <div
                        key={task.id}
                        className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                task.taskType === "product_demo"
                                  ? "bg-purple-100 text-purple-700 border border-purple-200"
                                  : "bg-blue-100 text-blue-700 border border-blue-200"
                              }`}
                            >
                              {task.taskType === "product_demo" ? "Product Demo" : "Callback"}
                            </span>
                            <span className="text-xs font-semibold text-gray-900 truncate">
                              {task.lead?.companyName || task.lead?.contactName || "Lead Contact"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 flex items-center gap-2">
                            <span>🕒 {formatDateTime(task.scheduledTime)}</span>
                            {task.lead?.businessVertical && (
                              <span>• {task.lead.businessVertical}</span>
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={telLink}
                            className="p-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition border border-emerald-200"
                            title="Call Lead"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-green-700 bg-green-50 hover:bg-green-100 rounded-xl transition border border-green-200"
                            title="WhatsApp Pitch"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* My Active Deals in Play */}
          <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  My Active Deals in Pipeline
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Deals in quote or negotiation stages awaiting closure
                </p>
              </div>
              <Link
                href="/pipeline"
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                Kanban Pipeline <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentDeals.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">
                No active deals in negotiation. Create a deal when a lead expresses buying interest!
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentDeals.map((deal: any) => (
                  <div key={deal.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-gray-900">
                        {deal.lead?.companyName || deal.lead?.contactName || "Client"}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {deal.serviceType} • Quoted: <strong>{formatCurrency(deal.quotedPrice)}</strong>
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      {deal.stage.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Outcomes & Activity */}
        <div className="space-y-6">
          {/* My Call Dispositions Today */}
          <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-5">
            <h3 className="text-base font-bold text-gray-900 mb-1">
              Call Outcomes ({periodLabel})
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Distribution of dispositions recorded across your dials
            </p>

            <div className="space-y-3">
              {[
                { label: "Connected Calls", count: dispositionMap["Connected"] || 0, color: "bg-emerald-500" },
                { label: "Ringing No Response (RNR)", count: dispositionMap["RNR"] || 0, color: "bg-amber-400" },
                { label: "Callbacks Promised", count: dispositionMap["Callback"] || 0, color: "bg-blue-500" },
                { label: "Demo Scheduled", count: dispositionMap["Demo Scheduled"] || 0, color: "bg-purple-500" },
                { label: "Not Interested", count: dispositionMap["Not Interested"] || 0, color: "bg-gray-400" },
                { label: "Invalid Number", count: dispositionMap["Invalid"] || 0, color: "bg-rose-400" },
              ].map((item) => {
                const percent = totalCalls > 0 ? Math.round((item.count / totalCalls) * 100) : 0;
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-gray-700">{item.label}</span>
                      <span className="text-gray-500 font-semibold">
                        {item.count} ({percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-full transition-all duration-300`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Dials Feed */}
          <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Recent Activity</h3>
              <Link href="/calls" className="text-xs font-semibold text-emerald-600 hover:underline">
                Call history
              </Link>
            </div>

            {recentCalls.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">No calls recorded yet for this period.</p>
            ) : (
              <div className="space-y-3">
                {recentCalls.slice(0, 5).map((log: any) => (
                  <div key={log.id} className="text-xs p-2.5 rounded-xl bg-gray-50 border border-gray-100 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-800">
                        {log.lead?.companyName || log.lead?.contactName || log.lead?.phoneNumber}
                      </span>
                      <span className="text-[10px] text-gray-400">{formatDateTime(log.callTimestamp)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-emerald-700 text-[11px]">{log.disposition}</span>
                      {log.remark && (
                        <span className="text-gray-500 truncate" title={log.remark}>
                          • "{log.remark}"
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
