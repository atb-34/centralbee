/**
 * Dates are formatted for Istanbul, always. The group operates in one
 * timezone, and a cash forecast that silently shifts a day because the
 * viewer's laptop is set elsewhere would be worse than useless.
 */
export const APP_TIME_ZONE = "Europe/Istanbul";

const DATE_LONG = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: APP_TIME_ZONE,
});

const DATE_SHORT = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: APP_TIME_ZONE,
});

const DATE_TIME = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `09 Ağustos 2026` */
export function formatDateLong(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? DATE_LONG.format(date) : "—";
}

/** `09.08.2026` */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? DATE_SHORT.format(date) : "—";
}

/** `09 Ağu 2026 09:15` — used by every data-freshness badge. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? DATE_TIME.format(date) : "—";
}

/** Today in Istanbul as `YYYY-MM-DD`, for querying date columns. */
export function todayInAppZone(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(
    new Date()
  );
}
