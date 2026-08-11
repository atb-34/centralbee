import { describe, expect, it } from "vitest";

import {
  daysUntil,
  groupIntoStreams,
  monthlyFixedCost,
  nextIncreaseDate,
  nextPaymentDate,
  projectedAmountAfterIncrease,
  resolvePaymentDay,
  salarySplit,
  upcomingPayments,
  versionAt,
} from "./obligations";
import type { RecurringObligationRow } from "@/types/database";

function obligation(
  overrides: Partial<RecurringObligationRow> & {
    effective_from: string;
  }
): RecurringObligationRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    institution_id: "inst-1",
    obligation_type: "rent",
    stream_name: "",
    counterparty: null,
    amount_total: 0,
    amount_bank: null,
    amount_cash: null,
    payment_day: null,
    effective_to: null,
    increase_rule: "none",
    increase_rate: null,
    increase_month: null,
    increase_day: null,
    notes: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("versionAt", () => {
  // The claim the product's financial history rests on: looking at a past date
  // must return the figure that was in force then, not today's.
  const versions = [
    obligation({
      id: "new",
      effective_from: "2025-09-01",
      effective_to: null,
      amount_total: 650_000,
    }),
    obligation({
      id: "old",
      effective_from: "2024-09-01",
      effective_to: "2025-08-31",
      amount_total: 500_000,
    }),
  ];

  it("returns the version in force on a past date", () => {
    expect(versionAt(versions, "2025-01-15")?.amount_total).toBe(500_000);
  });

  it("returns the open version for a current date", () => {
    expect(versionAt(versions, "2026-01-15")?.amount_total).toBe(650_000);
  });

  it("returns the old version on its final day", () => {
    expect(versionAt(versions, "2025-08-31")?.id).toBe("old");
  });

  it("returns the new version on its first day", () => {
    expect(versionAt(versions, "2025-09-01")?.id).toBe("new");
  });

  it("returns null before anything was in force", () => {
    expect(versionAt(versions, "2024-01-01")).toBeNull();
  });
});

describe("nextPaymentDate", () => {
  it("returns today when the payment day is today", () => {
    expect(nextPaymentDate(15, "2026-03-15")).toBe("2026-03-15");
  });

  it("stays in this month when the day has not passed", () => {
    expect(nextPaymentDate(20, "2026-03-15")).toBe("2026-03-20");
  });

  it("rolls into next month once the day has passed", () => {
    expect(nextPaymentDate(5, "2026-03-15")).toBe("2026-04-05");
  });

  it("rolls across a year boundary", () => {
    expect(nextPaymentDate(5, "2026-12-15")).toBe("2027-01-05");
  });

  // A payment day of 31 must not silently skip February.
  it("clamps day 31 to the last day of a short month", () => {
    expect(nextPaymentDate(31, "2026-02-01")).toBe("2026-02-28");
  });

  it("clamps day 31 to the last day of a leap February", () => {
    expect(nextPaymentDate(31, "2028-02-01")).toBe("2028-02-29");
  });

  it("clamps day 31 in a 30-day month", () => {
    expect(nextPaymentDate(31, "2026-04-10")).toBe("2026-04-30");
  });
});

describe("daysUntil", () => {
  it("counts forward", () => {
    expect(daysUntil("2026-03-20", "2026-03-15")).toBe(5);
  });

  it("is zero for the same day", () => {
    expect(daysUntil("2026-03-15", "2026-03-15")).toBe(0);
  });

  // Istanbul has no DST changes any more, but the arithmetic is done in UTC
  // regardless so a date never drifts by an hour into the previous day.
  it("is unaffected by month boundaries", () => {
    expect(daysUntil("2026-04-01", "2026-03-30")).toBe(2);
  });
});

describe("resolvePaymentDay", () => {
  it("prefers the institution's own day", () => {
    expect(resolvePaymentDay({ payment_day: 10 }, 1)).toBe(10);
  });

  it("falls back to the company default", () => {
    expect(resolvePaymentDay({ payment_day: null }, 15)).toBe(15);
  });

  it("returns null when neither is set rather than guessing", () => {
    expect(resolvePaymentDay({ payment_day: null }, null)).toBeNull();
  });
});

describe("groupIntoStreams", () => {
  it("keeps two contracts of the same type apart", () => {
    const streams = groupIntoStreams([
      obligation({ effective_from: "2025-09-01", stream_name: "Ana Bina", amount_total: 480_000 }),
      obligation({ effective_from: "2025-09-01", stream_name: "Şube", amount_total: 220_000 }),
    ]);

    expect(streams).toHaveLength(2);
    expect(streams.map((s) => s.streamName).sort()).toEqual(["Ana Bina", "Şube"]);
  });

  it("collects versions of one stream together, newest first", () => {
    const streams = groupIntoStreams([
      obligation({ effective_from: "2024-09-01", effective_to: "2025-08-31", amount_total: 500_000 }),
      obligation({ effective_from: "2025-09-01", amount_total: 650_000 }),
    ]);

    expect(streams).toHaveLength(1);
    expect(streams[0].versions.map((v) => v.amount_total)).toEqual([650_000, 500_000]);
  });

  it("orders salary before rent", () => {
    const streams = groupIntoStreams([
      obligation({ effective_from: "2025-09-01", obligation_type: "rent" }),
      obligation({ effective_from: "2025-09-01", obligation_type: "salary" }),
    ]);

    expect(streams.map((s) => s.type)).toEqual(["salary", "rent"]);
  });
});

describe("monthlyFixedCost", () => {
  // An ended contract must not keep inflating the monthly cost — that is the
  // whole reason versions are kept rather than overwritten.
  it("counts only what is in force today", () => {
    const streams = groupIntoStreams([
      obligation({
        effective_from: "2020-01-01",
        effective_to: "2021-01-01",
        amount_total: 999_999,
        stream_name: "Kapanmış",
      }),
      obligation({ effective_from: "2025-09-01", amount_total: 650_000 }),
      obligation({
        effective_from: "2025-09-01",
        obligation_type: "salary",
        amount_total: 1_000_000,
      }),
    ]);

    expect(monthlyFixedCost(streams)).toBe(1_650_000);
  });
});

describe("salarySplit", () => {
  it("adds up bank and cash across salary streams", () => {
    const streams = groupIntoStreams([
      obligation({
        effective_from: "2025-09-01",
        obligation_type: "salary",
        amount_total: 1_000_000,
        amount_bank: 700_000,
        amount_cash: 300_000,
      }),
      obligation({ effective_from: "2025-09-01", amount_total: 650_000 }),
    ]);

    expect(salarySplit(streams)).toEqual({
      bank: 700_000,
      cash: 300_000,
      total: 1_000_000,
    });
  });
});

describe("nextIncreaseDate", () => {
  // Stored as day + month, so the field does not expire the year it passes.
  const septemberFirst = { increase_month: 9, increase_day: 1 };

  it("returns this year's date when it has not passed", () => {
    expect(nextIncreaseDate(septemberFirst, "2026-08-09")).toBe("2026-09-01");
  });

  it("returns the anniversary itself on the day", () => {
    expect(nextIncreaseDate(septemberFirst, "2026-09-01")).toBe("2026-09-01");
  });

  it("rolls to next year once the date has passed", () => {
    expect(nextIncreaseDate(septemberFirst, "2026-09-02")).toBe("2027-09-01");
  });

  it("clamps 29 February to the 28th in a common year", () => {
    expect(
      nextIncreaseDate({ increase_month: 2, increase_day: 29 }, "2027-01-01")
    ).toBe("2027-02-28");
  });

  it("keeps 29 February in a leap year", () => {
    expect(
      nextIncreaseDate({ increase_month: 2, increase_day: 29 }, "2028-01-01")
    ).toBe("2028-02-29");
  });

  it("returns null when no increase date is set", () => {
    expect(
      nextIncreaseDate({ increase_month: null, increase_day: null }, "2026-08-09")
    ).toBeNull();
  });
});

describe("projectedAmountAfterIncrease", () => {
  it("applies a fixed percentage", () => {
    expect(
      projectedAmountAfterIncrease({
        amount_total: 650_000,
        increase_rule: "fixed_percent",
        increase_rate: 25,
      })
    ).toBe(812_500);
  });

  // Guessing at an inflation figure the system does not hold would put a
  // fabricated number into the cash forecast.
  it("returns null for inflation-linked increases", () => {
    expect(
      projectedAmountAfterIncrease({
        amount_total: 650_000,
        increase_rule: "inflation",
        increase_rate: null,
      })
    ).toBeNull();
  });

  it("returns null when the rate is missing", () => {
    expect(
      projectedAmountAfterIncrease({
        amount_total: 650_000,
        increase_rule: "fixed_percent",
        increase_rate: null,
      })
    ).toBeNull();
  });

  it("returns null when there is no increase", () => {
    expect(
      projectedAmountAfterIncrease({
        amount_total: 650_000,
        increase_rule: "none",
        increase_rate: null,
      })
    ).toBeNull();
  });
});

describe("upcomingPayments", () => {
  it("orders by date and applies the company default day", () => {
    const streams = groupIntoStreams([
      obligation({
        effective_from: "2025-09-01",
        obligation_type: "salary",
        amount_total: 1_000_000,
        payment_day: null,
      }),
      obligation({ effective_from: "2025-09-01", amount_total: 650_000, payment_day: 20 }),
    ]);

    const payments = upcomingPayments(streams, 1, "2026-03-15");

    expect(payments.map((p) => p.dateIso)).toEqual(["2026-03-20", "2026-04-01"]);
    expect(payments[0].stream.type).toBe("rent");
    expect(payments[1].paymentDay).toBe(1);
  });

  it("leaves out obligations with no payment day rather than guessing one", () => {
    const streams = groupIntoStreams([
      obligation({ effective_from: "2025-09-01", amount_total: 650_000, payment_day: null }),
    ]);

    expect(upcomingPayments(streams, null, "2026-03-15")).toEqual([]);
  });

  it("skips a contract that ends before its next payment falls due", () => {
    const streams = groupIntoStreams([
      obligation({
        effective_from: "2025-09-01",
        effective_to: "2026-03-18",
        amount_total: 650_000,
        payment_day: 20,
      }),
    ]);

    expect(upcomingPayments(streams, null, "2026-03-15")).toEqual([]);
  });
});
