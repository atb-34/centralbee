const INTEGER = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const PERCENT_1 = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return INTEGER.format(value);
}

/** `%53,3` — Turkish convention puts the sign before the figure. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `%${PERCENT_1.format(value)}`;
}

/** `+%28,4` / `-%12` — for change against a comparison figure. */
export function formatPercentChange(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}%${PERCENT_1.format(Math.abs(value))}`;
}

export function formatSignedCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${INTEGER.format(Math.abs(value))}`;
}
