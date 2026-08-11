import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";

import { OperationDialog } from "./operation-dialog";
import { OperationsBoard } from "./operations-board";
import { EmptyState } from "@/components/app/empty-state";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { can, requirePermission } from "@/lib/auth/viewer";
import { CLOSED_STATUSES, sortOperations, summarise } from "@/lib/calc/operations";
import { formatMoneyCompact } from "@/lib/format/money";
import { formatCount } from "@/lib/format/number";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { OperationUpdateRow } from "@/types/database";

export const metadata: Metadata = {
  title: "Operasyon",
};

/** How much activity history to bring back with the list. */
const HISTORY_LIMIT = 500;

const VIEWS = [
  { key: "acik", label: "Açık işler" },
  { key: "dikkat", label: "CEO dikkati" },
  { key: "geciken", label: "Gecikenler" },
  { key: "tumu", label: "Tümü" },
] as const;

export default async function OperationsPage(props: PageProps<"/operations">) {
  const viewer = await requirePermission(permission(MODULES.operations, "view"));
  const searchParams = await props.searchParams;

  const requestedView =
    typeof searchParams.gorunum === "string" ? searchParams.gorunum : "acik";
  const view = VIEWS.some((entry) => entry.key === requestedView)
    ? requestedView
    : "acik";

  const supabase = await createSupabaseServerClient();

  const [{ data: operations }, { data: institutions }, { data: people }] =
    await Promise.all([
      supabase.from("operations").select("*"),
      supabase.from("institutions").select("id, name").order("name"),
      supabase
        .from("people")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name"),
    ]);

  const all = operations ?? [];
  const summary = summarise(all);

  const filtered = all.filter((operation) => {
    switch (view) {
      case "dikkat":
        return operation.ceo_attention && !CLOSED_STATUSES.includes(operation.status);
      case "geciken":
        return (
          !CLOSED_STATUSES.includes(operation.status) &&
          operation.deadline !== null &&
          operation.deadline < new Date().toISOString().slice(0, 10)
        );
      case "tumu":
        return true;
      default:
        // Completed and cancelled work leaves the default view; it is still
        // one click away under "Tümü".
        return !CLOSED_STATUSES.includes(operation.status);
    }
  });

  const sorted = sortOperations(filtered);

  // Activity history for the rows on screen, fetched in one go so opening a
  // drawer costs nothing.
  let updatesByOperation: Record<string, OperationUpdateRow[]> = {};
  if (sorted.length > 0) {
    const { data: updates } = await supabase
      .from("operation_updates")
      .select("*")
      .in(
        "operation_id",
        sorted.map((operation) => operation.id)
      )
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    updatesByOperation = (updates ?? []).reduce<Record<string, OperationUpdateRow[]>>(
      (grouped, entry) => {
        (grouped[entry.operation_id] ??= []).push(entry);
        return grouped;
      },
      {}
    );
  }

  const institutionOptions = (institutions ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }));
  const peopleOptions = (people ?? []).map((row) => ({
    id: row.id,
    name: row.full_name,
  }));

  const institutionNames = Object.fromEntries(
    institutionOptions.map((row) => [row.id, row.name])
  );
  const personNames = Object.fromEntries(
    peopleOptions.map((row) => [row.id, row.name])
  );

  const canCreate = can(viewer, permission(MODULES.operations, "create"));
  const canEdit = can(viewer, permission(MODULES.operations, "edit"));

  const createButton =
    canCreate && institutionOptions.length > 0 ? (
      <OperationDialog
        institutions={institutionOptions}
        people={peopleOptions}
        trigger={
          <Button size="sm">
            <Plus />
            Operasyon ekle
          </Button>
        }
      />
    ) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Operasyon"
        description="Kurumlardaki işler: tadilat, bakım, izin süreçleri, satın alma."
        actions={createButton}
      />

      {all.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Açık iş" value={formatCount(summary.open)} />
          <MetricCard
            label="Geciken"
            value={formatCount(summary.overdue)}
            tone={summary.overdue > 0 ? "critical" : "neutral"}
            context={summary.overdue > 0 ? "Termini geçmiş, hâlâ açık" : "Gecikme yok"}
          />
          <MetricCard
            label="CEO dikkati"
            value={formatCount(summary.needsCeo)}
            tone={summary.needsCeo > 0 ? "warning" : "neutral"}
            context={`${formatCount(summary.critical)} kritik öncelikli`}
          />
          <MetricCard
            label="Açık işlerin maliyeti"
            value={formatMoneyCompact(summary.estimatedCost)}
            comparison={
              summary.actualCost > 0
                ? `${formatMoneyCompact(summary.actualCost)} harcandı`
                : undefined
            }
            context="Tahmini toplam"
          />
        </div>
      ) : null}

      <nav className="flex h-9 items-center gap-1 border-b border-border">
        {VIEWS.map((entry) => {
          const isActive = entry.key === view;
          return (
            <Link
              key={entry.key}
              href={`/operations?gorunum=${entry.key}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex items-center border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
                isActive
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {entry.label}
            </Link>
          );
        })}
      </nav>

      {sorted.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={
            all.length === 0
              ? "Henüz operasyon kaydı yok"
              : "Bu görünümde iş yok"
          }
          description={
            all.length === 0
              ? institutionOptions.length === 0
                ? "Önce en az bir kurum tanımlamanız gerekiyor. Operasyonlar bir kuruma bağlıdır."
                : "Tadilat, bakım, izin süreci gibi işler burada takip edilir. Kapalı satır bile CEO'nun durumu anlamasına yetecek bilgiyi taşır."
              : "Filtreyi değiştirerek diğer işlere bakabilirsiniz."
          }
          action={
            all.length === 0 && institutionOptions.length === 0 ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/companies">Kurum ekle</Link>
              </Button>
            ) : (
              createButton
            )
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <OperationsBoard
            operations={sorted}
            institutionNames={institutionNames}
            personNames={personNames}
            updatesByOperation={updatesByOperation}
            institutions={institutionOptions}
            people={peopleOptions}
            canEdit={canEdit}
          />
        </Card>
      )}
    </div>
  );
}
