import { Badge } from "@/components/ui/badge";
import type { InstitutionStatus } from "@/types/database";

const INSTITUTION_STATUS: Record<
  InstitutionStatus,
  { label: string; variant: "positive" | "warning" | "default" }
> = {
  active: { label: "Aktif", variant: "positive" },
  paused: { label: "Duraklatıldı", variant: "warning" },
  closed: { label: "Kapalı", variant: "default" },
};

/**
 * Status is never colour alone — the badge always carries its label too, so it
 * survives being printed, screenshotted or read by someone colour-blind.
 */
export function StatusBadge({ status }: { status: InstitutionStatus }) {
  const config = INSTITUTION_STATUS[status] ?? INSTITUTION_STATUS.closed;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
