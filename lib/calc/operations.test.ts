import { describe, expect, it } from "vitest";

import {
  compareOperations,
  costVariance,
  daysRemaining,
  deadlineTone,
  isOverdue,
  sortOperations,
  summarise,
} from "./operations";
import type { OperationRow } from "@/types/database";

const TODAY = "2026-08-09";

function operation(overrides: Partial<OperationRow> = {}): OperationRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    institution_id: "inst-1",
    title: "Görev",
    description: null,
    category: null,
    priority: "medium",
    status: "in_progress",
    progress: 0,
    responsible_person_id: null,
    start_date: null,
    deadline: null,
    completed_at: null,
    estimated_cost: null,
    actual_cost: null,
    next_action: null,
    next_action_date: null,
    waiting_on: null,
    blocker: null,
    ceo_attention: false,
    ceo_notes: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("daysRemaining", () => {
  it("counts forward to a future deadline", () => {
    expect(daysRemaining({ deadline: "2026-08-19" }, TODAY)).toBe(10);
  });

  it("is zero on the deadline itself", () => {
    expect(daysRemaining({ deadline: TODAY }, TODAY)).toBe(0);
  });

  it("goes negative once the deadline has passed", () => {
    expect(daysRemaining({ deadline: "2026-08-04" }, TODAY)).toBe(-5);
  });

  // An absent deadline is not day zero.
  it("returns null when there is no deadline", () => {
    expect(daysRemaining({ deadline: null }, TODAY)).toBeNull();
  });
});

describe("isOverdue", () => {
  it("flags an open task past its deadline", () => {
    expect(
      isOverdue({ deadline: "2026-08-01", status: "in_progress" }, TODAY)
    ).toBe(true);
  });

  // A finished task is never late, however long it took.
  it("does not flag a completed task", () => {
    expect(isOverdue({ deadline: "2026-08-01", status: "completed" }, TODAY)).toBe(
      false
    );
  });

  it("does not flag a cancelled task", () => {
    expect(isOverdue({ deadline: "2026-08-01", status: "cancelled" }, TODAY)).toBe(
      false
    );
  });

  it("does not flag a task with no deadline", () => {
    expect(isOverdue({ deadline: null, status: "blocked" }, TODAY)).toBe(false);
  });
});

describe("deadlineTone", () => {
  it("is critical when overdue", () => {
    expect(deadlineTone({ deadline: "2026-08-01", status: "waiting" }, TODAY)).toBe(
      "critical"
    );
  });

  it("warns within a week", () => {
    expect(
      deadlineTone({ deadline: "2026-08-14", status: "in_progress" }, TODAY)
    ).toBe("warning");
  });

  it("is neutral further out", () => {
    expect(
      deadlineTone({ deadline: "2026-09-30", status: "in_progress" }, TODAY)
    ).toBe("neutral");
  });

  it("is neutral for closed tasks even when overdue", () => {
    expect(deadlineTone({ deadline: "2026-01-01", status: "completed" }, TODAY)).toBe(
      "neutral"
    );
  });
});

describe("compareOperations / sortOperations", () => {
  // The flag exists to jump the queue; that is its whole purpose.
  it("puts CEO attention above everything, including priority", () => {
    const flaggedLow = operation({ ceo_attention: true, priority: "low" });
    const criticalUnflagged = operation({ priority: "critical" });

    expect(compareOperations(flaggedLow, criticalUnflagged, TODAY)).toBeLessThan(0);
  });

  it("orders by priority next", () => {
    const sorted = sortOperations(
      [
        operation({ title: "düşük", priority: "low" }),
        operation({ title: "kritik", priority: "critical" }),
        operation({ title: "orta", priority: "medium" }),
        operation({ title: "yüksek", priority: "high" }),
      ],
      TODAY
    );

    expect(sorted.map((o) => o.title)).toEqual(["kritik", "yüksek", "orta", "düşük"]);
  });

  it("orders by deadline within the same priority, soonest first", () => {
    const sorted = sortOperations(
      [
        operation({ title: "geç", deadline: "2026-12-01" }),
        operation({ title: "gecikmiş", deadline: "2026-08-01" }),
        operation({ title: "yakın", deadline: "2026-08-15" }),
      ],
      TODAY
    );

    expect(sorted.map((o) => o.title)).toEqual(["gecikmiş", "yakın", "geç"]);
  });

  // Having no date does not make a task more urgent than a dated one.
  it("sorts undated tasks after dated ones", () => {
    const sorted = sortOperations(
      [
        operation({ title: "tarihsiz", deadline: null }),
        operation({ title: "tarihli", deadline: "2026-12-01" }),
      ],
      TODAY
    );

    expect(sorted.map((o) => o.title)).toEqual(["tarihli", "tarihsiz"]);
  });
});

describe("costVariance", () => {
  it("reports overspend as positive", () => {
    expect(costVariance({ estimated_cost: 100_000, actual_cost: 125_000 })).toEqual({
      absolute: 25_000,
      percent: 25,
    });
  });

  it("reports underspend as negative", () => {
    expect(costVariance({ estimated_cost: 100_000, actual_cost: 80_000 })).toEqual({
      absolute: -20_000,
      percent: -20,
    });
  });

  // A variance against an unknown estimate is not a variance.
  it("returns null when the estimate is missing", () => {
    expect(costVariance({ estimated_cost: null, actual_cost: 80_000 })).toBeNull();
  });

  it("returns null when the actual is missing", () => {
    expect(costVariance({ estimated_cost: 100_000, actual_cost: null })).toBeNull();
  });

  it("gives no percentage against a zero estimate", () => {
    expect(costVariance({ estimated_cost: 0, actual_cost: 5_000 })?.percent).toBeNull();
  });
});

describe("summarise", () => {
  it("counts only open work", () => {
    const summary = summarise(
      [
        operation({ status: "completed", progress: 100, priority: "critical" }),
        operation({ status: "cancelled", priority: "critical" }),
        operation({ status: "in_progress", priority: "critical" }),
        operation({ status: "blocked", deadline: "2026-08-01", blocker: "beklemede" }),
        operation({ status: "waiting", ceo_attention: true }),
      ],
      TODAY
    );

    expect(summary).toEqual({
      open: 3,
      overdue: 1,
      critical: 1,
      needsCeo: 1,
      estimatedCost: 0,
      actualCost: 0,
    });
  });

  it("adds up costs of open work only", () => {
    const summary = summarise(
      [
        operation({ status: "in_progress", estimated_cost: 100_000, actual_cost: 40_000 }),
        operation({ status: "in_progress", estimated_cost: 50_000, actual_cost: null }),
        operation({
          status: "completed",
          progress: 100,
          estimated_cost: 999_999,
          actual_cost: 999_999,
        }),
      ],
      TODAY
    );

    expect(summary.estimatedCost).toBe(150_000);
    expect(summary.actualCost).toBe(40_000);
  });
});
