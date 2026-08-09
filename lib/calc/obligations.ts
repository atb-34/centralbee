import { APP_TIME_ZONE, todayInAppZone } from "@/lib/format/date";
import type { ObligationType, RecurringObligationRow } from "@/types/database";

/**
 * Recurring obligation calculations.
 *
 * Every screen that shows a rent figure, a monthly fixed cost or an upcoming
 * payment date reads it from here. The cash forecast in Phase 7 will consume
 * the same functions, so a payment date shown on an institution page and the
 * one used in the forecast cannot drift apart.
 */

export const OBLIGATION_LABELS: Record<ObligationType, string> = {
  salary: "Maaş",
  rent: "Kira",
  sgk: "SGK",
  tax: "Vergi",
  insurance: "Sigorta",
  other: "Diğer",
};

/** Display order — the big, unavoidable costs first. */
export const OBLIGATION_ORDER: ObligationType[] = [
  "salary",
  "rent",
  "sgk",
  "tax",
  "insurance",
  "other",
];

export const INCREASE_RULE_LABELS: Record<string, string> = {
  none: "Artış yok",
  fixed_percent: "Sabit yüzde",
  inflation: "Enflasyona endeksli",
  contract: "Sözleşmeye göre",
  custom: "Özel",
};

/**
 * A stream is one obligation followed through time — "Kira · Ana Bina" — and
 * its versions, newest first.
 */
export type ObligationStream = {
  institutionId: string;
  type: ObligationType;
  streamName: string;
  /** Newest first. */
  versions: RecurringObligationRow[];
  /** The version in force today, or null if the stream has ended. */
  current: RecurringObligationRow | null;
};

function coversDate(row: RecurringObligationRow, isoDate: string): boolean {
  if (isoDate < row.effective_from) return false;
  if (row.effective_to !== null && isoDate > row.effective_to) return false;
  return true;
}

/** The version in force on a given day, or null if none was. */
export function versionAt(
  versions: RecurringObligationRow[],
  isoDate: string
): RecurringObligationRow | null {
  return versions.find((row) => coversDate(row, isoDate)) ?? null;
}

/** Groups flat rows into streams, each with its version history. */
export function groupIntoStreams(
  rows: RecurringObligationRow[]
): ObligationStream[] {
  const today = todayInAppZone();
  const byKey = new Map<string, ObligationStream>();

  for (const row of rows) {
    const key = `${row.institution_id}|${row.obligation_type}|${row.stream_name}`;
    let stream = byKey.get(key);
    if (!stream) {
      stream = {
        institutionId: row.institution_id,
        type: row.obligation_type,
        streamName: row.stream_name,
        versions: [],
        current: null,
      };
      byKey.set(key, stream);
    }
    stream.versions.push(row);
  }

  for (const stream of byKey.values()) {
    stream.versions.sort((a, b) => b.effective_from.localeCompare(a.effective_from));
    stream.current = versionAt(stream.versions, today);
  }

  return [...byKey.values()].sort((a, b) => {
    const byType =
      OBLIGATION_ORDER.indexOf(a.type) - OBLIGATION_ORDER.indexOf(b.type);
    return byType !== 0 ? byType : a.streamName.localeCompare(b.streamName, "tr");
  });
}

/**
 * Total monthly fixed cost from the versions in force today.
 *
 * Streams that have ended contribute nothing — that is the whole point of
 * keeping the old versions rather than overwriting them.
 */
export function monthlyFixedCost(streams: ObligationStream[]): number {
  return streams.reduce(
    (total, stream) => total + (stream.current?.amount_total ?? 0),
    0
  );
}

/** Salary split across bank and cash, for the streams in force today. */
export function salarySplit(streams: ObligationStream[]): {
  bank: number;
  cash: number;
  total: number;
} {
  let bank = 0;
  let cash = 0;
  let total = 0;

  for (const stream of streams) {
    if (stream.type !== "salary" || !stream.current) continue;
    bank += stream.current.amount_bank ?? 0;
    cash += stream.current.amount_cash ?? 0;
    total += stream.current.amount_total;
  }

  return { bank, cash, total };
}

/**
 * Which day of the month this obligation is paid on.
 *
 * The institution's own value wins; the company default fills in when it has
 * none. Neither is hard-coded anywhere — ATB paying on the 1st and ABD on the
 * 15th is configuration, not logic.
 */
export function resolvePaymentDay(
  obligation: Pick<RecurringObligationRow, "payment_day">,
  companyDefaultDay: number | null
): number | null {
  return obligation.payment_day ?? companyDefaultDay;
}

/**
 * The next occurrence of a monthly payment day, on or after `fromIso`.
 *
 * A payment day of 31 in a 30-day month falls on the last day of that month
 * rather than slipping into the next one.
 */
export function nextPaymentDate(
  paymentDay: number,
  fromIso: string = todayInAppZone()
): string {
  const [year, month, day] = fromIso.split("-").map(Number);

  const clampToMonth = (y: number, m: number): number => {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Math.min(paymentDay, lastDay);
  };

  const thisMonth = clampToMonth(year, month);
  if (day <= thisMonth) {
    return `${year}-${String(month).padStart(2, "0")}-${String(thisMonth).padStart(2, "0")}`;
  }

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const inNextMonth = clampToMonth(nextYear, nextMonth);

  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(inNextMonth).padStart(2, "0")}`;
}

/** How many days from today until an ISO date, in the app's timezone. */
export function daysUntil(isoDate: string, fromIso: string = todayInAppZone()): number {
  const target = Date.parse(`${isoDate}T00:00:00Z`);
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  return Math.round((target - from) / 86_400_000);
}

export type UpcomingPayment = {
  stream: ObligationStream;
  obligation: RecurringObligationRow;
  paymentDay: number;
  dateIso: string;
  daysAway: number;
  amount: number;
};

/**
 * Upcoming payments for the streams in force today, soonest first.
 *
 * Streams with no payment day — neither their own nor a company default — are
 * left out rather than guessed at. A forecast built on a guessed date is worse
 * than one that admits the date is missing.
 */
export function upcomingPayments(
  streams: ObligationStream[],
  companyDefaultDay: number | null,
  fromIso: string = todayInAppZone()
): UpcomingPayment[] {
  const payments: UpcomingPayment[] = [];

  for (const stream of streams) {
    const obligation = stream.current;
    if (!obligation) continue;

    const paymentDay = resolvePaymentDay(obligation, companyDefaultDay);
    if (paymentDay === null) continue;

    const dateIso = nextPaymentDate(paymentDay, fromIso);

    // A contract that ends before its next payment date has no next payment.
    if (obligation.effective_to !== null && dateIso > obligation.effective_to) {
      continue;
    }

    payments.push({
      stream,
      obligation,
      paymentDay,
      dateIso,
      daysAway: daysUntil(dateIso, fromIso),
      amount: obligation.amount_total,
    });
  }

  return payments.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

export { APP_TIME_ZONE };
