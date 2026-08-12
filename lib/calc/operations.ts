import { todayInAppZone } from "@/lib/format/date";
import type {
  OperationPriority,
  OperationRow,
  OperationStatus,
} from "@/types/database";

/**
 * Operation calculations.
 *
 * The list is read by someone deciding what to deal with today, so ordering
 * and lateness are the product, not decoration. Both live here so the
 * institution page, the operations list and — in Phase 8 — the morning review
 * cannot disagree about which task is the urgent one.
 */

export const PRIORITY_LABELS: Record<OperationPriority, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

export const STATUS_LABELS: Record<OperationStatus, string> = {
  not_started: "Başlamadı",
  in_progress: "Devam ediyor",
  waiting: "Bekliyor",
  blocked: "Engellendi",
  completed: "Tamamlandı",
  cancelled: "İptal",
};

const PRIORITY_RANK: Record<OperationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Statuses that no longer need attention; hidden from the default view. */
export const CLOSED_STATUSES: OperationStatus[] = ["completed", "cancelled"];

export function isClosed(operation: Pick<OperationRow, "status">): boolean {
  return CLOSED_STATUSES.includes(operation.status);
}

/**
 * Days until the deadline. Negative means overdue.
 * Null when there is no deadline — an absent date is not day zero.
 */
export function daysRemaining(
  operation: Pick<OperationRow, "deadline">,
  fromIso: string = todayInAppZone()
): number | null {
  if (!operation.deadline) return null;
  const target = Date.parse(`${operation.deadline}T00:00:00Z`);
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  return Math.round((target - from) / 86_400_000);
}

/** Past its deadline and still open. A finished task is never overdue. */
export function isOverdue(
  operation: Pick<OperationRow, "deadline" | "status">,
  fromIso: string = todayInAppZone()
): boolean {
  if (isClosed(operation)) return false;
  const remaining = daysRemaining(operation, fromIso);
  return remaining !== null && remaining < 0;
}

export type UrgencyTone = "critical" | "warning" | "neutral";

/**
 * How the deadline should read at a glance: overdue and due-within-a-week are
 * the two states worth colouring.
 */
export function deadlineTone(
  operation: Pick<OperationRow, "deadline" | "status">,
  fromIso: string = todayInAppZone()
): UrgencyTone {
  if (isClosed(operation)) return "neutral";
  const remaining = daysRemaining(operation, fromIso);
  if (remaining === null) return "neutral";
  if (remaining < 0) return "critical";
  if (remaining <= 7) return "warning";
  return "neutral";
}

/**
 * Default ordering: what needs a decision first.
 *
 * CEO attention outranks everything — that flag exists precisely to jump the
 * queue. Then priority, then how soon it is due. Tasks with no deadline sort
 * after those that have one; an undated task is not more urgent than a dated
 * one just because it has no number.
 */
export function compareOperations(
  a: OperationRow,
  b: OperationRow,
  fromIso: string = todayInAppZone()
): number {
  if (a.ceo_attention !== b.ceo_attention) return a.ceo_attention ? -1 : 1;

  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;

  const aDays = daysRemaining(a, fromIso);
  const bDays = daysRemaining(b, fromIso);
  if (aDays === null && bDays === null) return a.title.localeCompare(b.title, "tr");
  if (aDays === null) return 1;
  if (bDays === null) return -1;

  return aDays - bDays;
}

export function sortOperations(
  operations: OperationRow[],
  fromIso: string = todayInAppZone()
): OperationRow[] {
  return [...operations].sort((a, b) => compareOperations(a, b, fromIso));
}

/**
 * Actual minus estimated. Positive means over budget.
 * Null unless both figures exist — a variance against an unknown estimate is
 * not a variance.
 */
export function costVariance(
  operation: Pick<OperationRow, "estimated_cost" | "actual_cost">
): { absolute: number; percent: number | null } | null {
  const { estimated_cost: estimated, actual_cost: actual } = operation;
  if (estimated === null || actual === null) return null;

  const absolute = actual - estimated;
  return {
    absolute,
    percent: estimated === 0 ? null : (absolute / estimated) * 100,
  };
}

export type OperationSummary = {
  open: number;
  overdue: number;
  critical: number;
  needsCeo: number;
  estimatedCost: number;
  actualCost: number;
};

/** Headline counts for the operations page and, later, the morning review. */
export function summarise(
  operations: OperationRow[],
  fromIso: string = todayInAppZone()
): OperationSummary {
  const open = operations.filter((operation) => !isClosed(operation));

  return {
    open: open.length,
    overdue: open.filter((operation) => isOverdue(operation, fromIso)).length,
    critical: open.filter((operation) => operation.priority === "critical").length,
    needsCeo: open.filter((operation) => operation.ceo_attention).length,
    estimatedCost: open.reduce(
      (total, operation) => total + (operation.estimated_cost ?? 0),
      0
    ),
    actualCost: open.reduce(
      (total, operation) => total + (operation.actual_cost ?? 0),
      0
    ),
  };
}
