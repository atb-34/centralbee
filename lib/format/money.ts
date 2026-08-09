/**
 * Money formatting.
 *
 * Two registers, used consistently across the product:
 *   compact  ₺64,5M   overview cards, ranking tables, chart axes
 *   full     ₺64.500.000   drill-downs, transaction lists, anywhere the exact
 *                          figure is the point
 *
 * Mixing them on one screen is what makes a financial dashboard feel sloppy,
 * so the choice belongs to the surface, never to the individual number.
 */

const TRY_FULL = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

const TRY_FULL_PRECISE = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DECIMAL_1 = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** `₺64.500.000` — for detail views where the exact figure matters. */
export function formatMoney(value: number | null | undefined, precise = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return precise ? TRY_FULL_PRECISE.format(value) : TRY_FULL.format(value);
}

/** `₺64,5M` / `₺850K` — for overview surfaces where scale matters. */
export function formatMoneyCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";

  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) return `${sign}₺${DECIMAL_1.format(abs / 1_000_000_000)}Mr`;
  if (abs >= 1_000_000) return `${sign}₺${DECIMAL_1.format(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}₺${DECIMAL_1.format(abs / 1_000)}K`;

  return `${sign}₺${DECIMAL_1.format(abs)}`;
}
