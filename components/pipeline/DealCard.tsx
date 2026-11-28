"use client";

import { formatCurrency, cn, getDealDisplayAmount, extractWonDateFromNotes, parseDealDateToTimestamp } from "@/lib/utils";
import { Calendar, Clock, Tag, User, Trash2, Edit3, Video, Phone, MessageSquareText, ExternalLink, CreditCard, AlertCircle } from "lucide-react";
import { sanitizeExternalUrl } from "@/lib/url-safety";

function parseClosingNotesMeta(raw?: string | null): {
  meta: Record<string, any>;
  plainText: string | null;
} {
  if (!raw || !raw.trim()) return { meta: {}, plainText: null };
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        const text =
          typeof parsed.notes === "string" && parsed.notes.trim()
            ? parsed.notes.trim()
            : typeof parsed.lostRemarks === "string" && parsed.lostRemarks.trim()
            ? parsed.lostRemarks.trim()
            : null;
        return { meta: parsed, plainText: text };
      }
    } catch {}
  }
  return { meta: {}, plainText: trimmed };
}

function isDateOnlyString(raw?: string | null): boolean {
  if (!raw) return false;
  const s = String(raw).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) || /T00:00:00(?:\.000)?Z?$/.test(s);
}

function formatISTCardDateTime(raw?: string | null, preferTime = true): string | null {
  const date = parseDealDateToTimestamp(raw);
  if (!date) return null;
  const dateOnly = isDateOnlyString(raw);
  if (preferTime && !dateOnly) {
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
  });
}

interface DealCardProps {
  deal: {
    id: string;
    stage?: string;
    repId?: string | null;
    serviceType: string;
    quantity: number;
    quotedPrice: string;
    closingNotes?: string | null;
    closedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    expectedClosingDate: string | null;
    payment?: {
      finalAmount?: string | null;
      paymentMode?: string | null;
      panelUserId?: string | null;
      opsApprovalStatus?: string | null;
      createdAt?: string | null;
    } | null;
    demoTask?: {
      scheduledTime?: string | null;
      meetingLink?: string | null;
      notes?: string | null;
      status?: string | null;
      completedAt?: string | null;
    } | null;
    followupTask?: {
      scheduledTime?: string | null;
      notes?: string | null;
    } | null;
    splits?: {
      repId: string;
      repName?: string;
      percentage: number;
      isPrimary: boolean;
      status: string;
    }[];
    lead?: {
      phoneNumber?: string;
      companyName: string | null;
      contactName: string | null;
      businessVertical?: string | null;
    } | null;
    rep?: { fullName: string } | null;
  };
  activeRepFilter?: string;
  isDragging?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onDelete?: (dealId: string) => void;
  onClick: () => void;
}

export function DealCard({
  deal,
  activeRepFilter,
  isDragging,
  canEdit,
  canDelete,
  onDelete,
  onClick,
}: DealCardProps) {
  const companyTitle =
    deal.lead?.companyName ||
    deal.lead?.contactName ||
    deal.lead?.phoneNumber ||
    "Direct Deal";

  const stage =
    deal.stage === "won"
      ? "closed_won"
      : deal.stage === "lost"
      ? "closed_lost"
      : deal.stage || "quote_sent";

  const { meta, plainText } = parseClosingNotesMeta(deal.closingNotes);

  // Compute primary timestamp badge for each stage
  const stageTimestamp = (() => {
    if (stage === "closed_won") {
      const wonDate = extractWonDateFromNotes(deal.closingNotes);
      const formatted = formatISTCardDateTime(
        wonDate || deal.closedAt || deal.expectedClosingDate,
        false
      );
      return formatted ? { label: "Closed", value: formatted, icon: "calendar" as const } : null;
    }
    if (stage === "demo_scheduled") {
      const raw =
        deal.demoTask?.scheduledTime || meta.demoDate || deal.updatedAt || deal.createdAt;
      const formatted = formatISTCardDateTime(raw, true);
      return formatted ? { label: "Demo Time", value: formatted, icon: "clock" as const } : null;
    }
    if (stage === "demo_done") {
      const raw =
        (deal.demoTask?.status === "completed" ? deal.demoTask?.completedAt : null) ||
        deal.updatedAt ||
        deal.createdAt;
      const formatted = formatISTCardDateTime(raw, true);
      return formatted ? { label: "Demo Done", value: formatted, icon: "clock" as const } : null;
    }
    if (stage === "quote_sent") {
      if (deal.expectedClosingDate) {
        const formatted = formatISTCardDateTime(deal.expectedClosingDate, false);
        return formatted ? { label: "Target", value: formatted, icon: "calendar" as const } : null;
      }
      const fuRaw = meta.contactBackDate || deal.followupTask?.scheduledTime;
      if (fuRaw) {
        const formatted = formatISTCardDateTime(fuRaw, true);
        return formatted ? { label: "Follow-up", value: formatted, icon: "clock" as const } : null;
      }
      const formatted = formatISTCardDateTime(deal.updatedAt || deal.createdAt, true);
      return formatted ? { label: "Sent", value: formatted, icon: "clock" as const } : null;
    }
    if (stage === "payment_pending") {
      const dueRaw = meta.paymentDueDate || deal.expectedClosingDate;
      if (dueRaw) {
        const formatted = formatISTCardDateTime(dueRaw, true);
        return formatted ? { label: "Pay Due", value: formatted, icon: "calendar" as const } : null;
      }
      const formatted = formatISTCardDateTime(deal.updatedAt || deal.createdAt, true);
      return formatted ? { label: "Updated", value: formatted, icon: "clock" as const } : null;
    }
    if (stage === "closed_lost") {
      const formatted = formatISTCardDateTime(deal.updatedAt || deal.createdAt, true);
      return formatted ? { label: "Lost", value: formatted, icon: "clock" as const } : null;
    }
    const formatted = formatISTCardDateTime(deal.expectedClosingDate || deal.updatedAt, true);
    return formatted ? { label: "Target", value: formatted, icon: "calendar" as const } : null;
  })();

  const meetingLink = (deal.demoTask?.meetingLink || meta.meetingLink || "") as string;
  const followupAt = formatISTCardDateTime(
    meta.contactBackDate || deal.followupTask?.scheduledTime || null,
    true
  );
  const recontactAt = formatISTCardDateTime(
    meta.recontactDate || deal.followupTask?.scheduledTime || null,
    true
  );
  const scheduledWasAt =
    stage === "demo_done"
      ? formatISTCardDateTime(deal.demoTask?.scheduledTime || meta.demoDate || null, true)
      : null;

  const displayNotes =
    stage === "demo_scheduled"
      ? deal.demoTask?.notes || plainText
      : stage === "closed_lost"
      ? meta.lostRemarks || plainText
      : plainText || deal.followupTask?.notes || null;

  const paymentMode = deal.payment?.paymentMode || meta.paymentMode || null;
  const portalUserId = deal.payment?.panelUserId || meta.userId || null;
  const opsStatus = deal.payment?.opsApprovalStatus || null;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative bg-white rounded-xl border border-slate-200/90 p-3.5 cursor-pointer hover:border-slate-300 hover:shadow-xs transition-all select-none space-y-2.5",
        isDragging && "shadow-xl rotate-1 border-emerald-400 bg-white ring-2 ring-emerald-500/20"
      )}
    >
      {/* Top action row: Company title, contact/phone & Level 2/3 quick actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-slate-800 leading-snug truncate">
            {companyTitle}
          </p>
          {deal.lead?.contactName && deal.lead?.companyName && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {deal.lead.contactName}
            </p>
          )}
          {deal.lead?.phoneNumber && companyTitle !== deal.lead.phoneNumber && (
            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1 truncate">
              <Phone className="w-2.5 h-2.5 shrink-0" />
              <span>{deal.lead.phoneNumber}</span>
            </p>
          )}
        </div>

        {/* Level 2 & Level 3 Quick Actions on hover */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {canEdit && (
            <span
              className="p-1 rounded text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition"
              title="Edit Deal (Level 2/3)"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </span>
          )}
          {canDelete && onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(deal.id);
              }}
              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
              title="Delete Deal (Level 2/3)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Service Tags & Vertical */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {deal.lead?.businessVertical && (
          <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium">
            {deal.lead.businessVertical}
          </span>
        )}
        {deal.serviceType
          ? deal.serviceType
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((st) => (
                <span
                  key={st}
                  className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200/60 px-2 py-0.5 rounded-md font-medium flex items-center gap-1"
                >
                  <Tag className="w-2.5 h-2.5 text-emerald-600" />
                  {st}
                </span>
              ))
          : null}
      </div>

      {/* Financials & Stage Timestamp */}
      {(() => {
        const fullAmount = getDealDisplayAmount(deal);
        const splits = deal.splits || [];
        const hasSplit = splits.length >= 2;
        const isApprovedSplit = hasSplit && splits.some((s) => s.status === "approved");
        const scopedSplit =
          isApprovedSplit && activeRepFilter && activeRepFilter !== "all"
            ? splits.find((s) => s.repId === activeRepFilter)
            : null;
        const displayAmount = scopedSplit
          ? (fullAmount * scopedSplit.percentage) / 100
          : fullAmount;

        return (
          <>
            {hasSplit && (
              <div className="flex flex-wrap items-center gap-1">
                <span
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-bold border",
                    isApprovedSplit
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                      : "bg-amber-50 text-amber-800 border-amber-200"
                  )}
                >
                  {scopedSplit
                    ? `Split ${scopedSplit.percentage}%`
                    : `Split ${splits.map((s) => `${s.percentage}%`).join(" / ")}`}
                  {!isApprovedSplit ? " (Pending)" : ""}
                </span>
                <span className="text-[10px] text-slate-500 truncate">
                  {splits.map((s) => s.repName?.split(" ")[0] || "Rep").join(" + ")}
                </span>
              </div>
            )}
            <div className="pt-1 flex items-baseline justify-between gap-2 border-t border-slate-100">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">
                  {formatCurrency(displayAmount)}
                </p>
                {scopedSplit && (
                  <p className="text-[10px] text-indigo-600 font-medium">
                    of {formatCurrency(fullAmount)} total
                  </p>
                )}
                <p className="text-[11px] text-slate-400 font-medium">
                  {(deal.quantity || 0).toLocaleString("en-IN")} units
                </p>
              </div>

              {stageTimestamp && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1 justify-end">
                    {stageTimestamp.icon === "clock" ? (
                      <Clock className="w-3 h-3 text-slate-400" />
                    ) : (
                      <Calendar className="w-3 h-3 text-slate-400" />
                    )}
                    {stageTimestamp.label}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                    {stageTimestamp.value}
                  </p>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* Stage-Specific Details Strip */}
      {(() => {
        const hasDemoSchedDetails =
          stage === "demo_scheduled" && (meta.decisionMakerName || meetingLink || displayNotes);
        const hasDemoDoneDetails =
          stage === "demo_done" && (scheduledWasAt || followupAt || meta.followupChannel || displayNotes);
        const hasQuoteDetails =
          stage === "quote_sent" && (followupAt || meta.followupChannel || displayNotes);
        const hasPayPendingDetails =
          stage === "payment_pending" && (paymentMode || displayNotes);
        const hasWonDetails =
          stage === "closed_won" && (opsStatus || paymentMode || portalUserId);
        const hasLostDetails =
          stage === "closed_lost" &&
          (meta.lostReason || meta.competitorName || recontactAt || displayNotes);

        if (
          !hasDemoSchedDetails &&
          !hasDemoDoneDetails &&
          !hasQuoteDetails &&
          !hasPayPendingDetails &&
          !hasWonDetails &&
          !hasLostDetails
        ) {
          return null;
        }

        return (
          <div className="bg-slate-50/80 border border-slate-100 rounded-lg px-2.5 py-2 space-y-1 text-[11px] text-slate-600">
            {stage === "demo_scheduled" && (
              <>
                {meta.decisionMakerName && (
                  <p className="truncate">
                    <span className="text-slate-400">DM:</span>{" "}
                    <span className="font-medium text-slate-700">{meta.decisionMakerName}</span>
                  </p>
                )}
                {meetingLink && (() => {
                  const safeMeetingLink = sanitizeExternalUrl(meetingLink);
                  return (
                    <div className="flex items-center gap-1 min-w-0">
                      <Video className="w-3 h-3 text-sky-600 shrink-0" />
                      {safeMeetingLink ? (
                        <a
                          href={safeMeetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-sky-700 hover:underline font-medium inline-flex items-center gap-1 truncate"
                        >
                          <span>Join Demo Link</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      ) : (
                        <span className="truncate text-slate-700">{meetingLink}</span>
                      )}
                    </div>
                  );
                })()}
              </>
            )}

            {stage === "demo_done" && (
              <>
                {scheduledWasAt && (
                  <p className="flex items-center gap-1 text-slate-500">
                    <Video className="w-3 h-3 text-sky-600 shrink-0" />
                    <span>Scheduled: {scheduledWasAt}</span>
                  </p>
                )}
                {(followupAt || meta.followupChannel) && (
                  <p className="flex items-center gap-1 flex-wrap text-slate-700">
                    <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                    {followupAt && <span>Follow-up: {followupAt}</span>}
                    {meta.followupChannel && (
                      <span className="bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.2 rounded text-[10px] font-medium">
                        {meta.followupChannel}
                      </span>
                    )}
                  </p>
                )}
              </>
            )}

            {stage === "quote_sent" && (followupAt || meta.followupChannel) && (
              <p className="flex items-center gap-1 flex-wrap text-slate-700">
                <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                {followupAt && <span>Follow-up: {followupAt}</span>}
                {meta.followupChannel && (
                  <span className="bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded text-[10px] font-medium">
                    {meta.followupChannel}
                  </span>
                )}
              </p>
            )}

            {stage === "payment_pending" && paymentMode && (
              <p className="flex items-center gap-1 text-slate-700">
                <CreditCard className="w-3 h-3 text-orange-600 shrink-0" />
                <span>Mode: {paymentMode}</span>
              </p>
            )}

            {stage === "closed_won" && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {opsStatus && (
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                      opsStatus === "approved"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : opsStatus === "rejected"
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                    )}
                  >
                    {opsStatus === "approved"
                      ? "Ops Approved"
                      : opsStatus === "rejected"
                      ? "Ops Rejected"
                      : "Pending Ops"}
                  </span>
                )}
                {paymentMode && (
                  <span className="text-[10px] text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded truncate">
                    {paymentMode}
                  </span>
                )}
                {portalUserId && (
                  <span className="text-[10px] font-mono text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded truncate">
                    ID: {portalUserId}
                  </span>
                )}
              </div>
            )}

            {stage === "closed_lost" && (
              <>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {meta.lostReason && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                      <AlertCircle className="w-2.5 h-2.5" />
                      {meta.lostReason}
                    </span>
                  )}
                  {meta.competitorName && (
                    <span className="text-[10px] text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                      vs {meta.competitorName}
                    </span>
                  )}
                </div>
                {recontactAt && (
                  <p className="flex items-center gap-1 text-slate-600">
                    <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                    <span>Recontact: {recontactAt}</span>
                  </p>
                )}
              </>
            )}

            {stage !== "closed_won" && displayNotes && (
              <p className="flex items-start gap-1 text-slate-500">
                <MessageSquareText className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                <span className="line-clamp-2 break-words">{displayNotes}</span>
              </p>
            )}
          </div>
        );
      })()}

      {/* Rep info footer */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100/80">
        <span className="flex items-center gap-1.5 truncate">
          <User className="w-3 h-3 text-slate-400" />
          <span className="truncate">{deal.rep?.fullName || "Assigned Rep"}</span>
        </span>
      </div>
    </div>
  );
}
