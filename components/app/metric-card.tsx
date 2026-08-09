import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * KPI card: label, figure, comparison, context.
 *
 * A card carrying only a large number tells an executive what happened but
 * not whether it is good, so `comparison` and `context` are part of the
 * component rather than an afterthought each page reinvents.
 */
export function MetricCard({
  label,
  value,
  comparison,
  context,
  tone = "neutral",
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  comparison?: React.ReactNode;
  context?: React.ReactNode;
  tone?: "neutral" | "positive" | "warning" | "critical";
  href?: string;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col gap-1.5 rounded-lg border border-border bg-card px-4 py-3",
        href && "transition-colors hover:border-border hover:bg-muted/50",
        className
      )}
    >
      <p className="label-caps text-muted-foreground">{label}</p>

      <p className="tabular text-2xl font-semibold leading-tight tracking-tight">
        {value}
      </p>

      {comparison ? (
        <p
          className={cn(
            "tabular text-[13px] font-medium",
            tone === "positive" && "text-positive",
            tone === "warning" && "text-warning",
            tone === "critical" && "text-critical",
            tone === "neutral" && "text-muted-foreground"
          )}
        >
          {comparison}
        </p>
      ) : null}

      {context ? (
        <p className="mt-auto pt-1 text-xs text-muted-foreground">{context}</p>
      ) : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
