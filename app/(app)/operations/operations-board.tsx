"use client";

import * as React from "react";
import { AlertCircle, LoaderCircle, Pencil, Star } from "lucide-react";

import { addOperationNoteAction } from "./actions";
import {
  OperationDialog,
  type InstitutionOption,
  type PersonOption,
} from "./operation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  costVariance,
  daysRemaining,
  deadlineTone,
  isClosed,
} from "@/lib/calc/operations";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import type {
  OperationPriority,
  OperationRow,
  OperationStatus,
  OperationUpdateRow,
} from "@/types/database";

const PRIORITY_VARIANT: Record<
  OperationPriority,
  "critical" | "warning" | "default" | "outline"
> = {
  critical: "critical",
  high: "warning",
  medium: "default",
  low: "outline",
};

const STATUS_VARIANT: Record<
  OperationStatus,
  "default" | "info" | "warning" | "critical" | "positive" | "outline"
> = {
  not_started: "outline",
  in_progress: "info",
  waiting: "warning",
  blocked: "critical",
  completed: "positive",
  cancelled: "default",
};

function DeadlineCell({ operation }: { operation: OperationRow }) {
  const remaining = daysRemaining(operation);
  const tone = deadlineTone(operation);

  if (!operation.deadline) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        tone === "critical" && "text-critical",
        tone === "warning" && "text-warning",
        tone === "neutral" && "text-muted-foreground"
      )}
    >
      {formatDate(operation.deadline)}
      {remaining !== null && !isClosed(operation) ? (
        <span className="ml-1.5">
          {remaining < 0
            ? `${Math.abs(remaining)} gün geçti`
            : remaining === 0
              ? "bugün"
              : `${remaining} gün`}
        </span>
      ) : null}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-brand"
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="tabular text-xs text-muted-foreground">%{value}</span>
    </span>
  );
}

function NoteForm({ operationId }: { operationId: string }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string>();
  const formRef = React.useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await addOperationNoteAction({}, formData);
      if (result.ok) {
        setError(undefined);
        formRef.current?.reset();
      } else {
        setError(result.error ?? "Not eklenemedi.");
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="operation_id" value={operationId} />
      <div className="flex gap-2">
        <Input name="body" placeholder="Gelişme notu ekleyin…" required />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" /> : "Ekle"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-critical">
          <AlertCircle className="size-3.5" />
          {error}
        </p>
      ) : null}
    </form>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-caps text-muted-foreground">{label}</span>
      <span className="text-[13px]">{value}</span>
    </div>
  );
}

export function OperationsBoard({
  operations,
  institutionNames,
  personNames,
  updatesByOperation,
  institutions,
  people,
  canEdit,
}: {
  operations: OperationRow[];
  institutionNames: Record<string, string>;
  personNames: Record<string, string>;
  updatesByOperation: Record<string, OperationUpdateRow[]>;
  institutions: InstitutionOption[];
  people: PersonOption[];
  canEdit: boolean;
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const selected = operations.find((operation) => operation.id === openId) ?? null;
  const history = selected ? (updatesByOperation[selected.id] ?? []) : [];
  const variance = selected ? costVariance(selected) : null;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Görev</TableHead>
            <TableHead>Kurum</TableHead>
            <TableHead>Öncelik</TableHead>
            <TableHead>Sorumlu</TableHead>
            <TableHead>Termin</TableHead>
            <TableHead data-align="right">Tahmini</TableHead>
            <TableHead data-align="right">Gerçek</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead>İlerleme</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {operations.map((operation) => (
            <TableRow
              key={operation.id}
              data-clickable="true"
              onClick={() => setOpenId(operation.id)}
            >
              <TableCell>
                <span className="flex items-start gap-1.5">
                  {operation.ceo_attention ? (
                    <Star
                      className="mt-0.5 size-3.5 shrink-0 fill-brand text-brand"
                      aria-label="CEO dikkati"
                    />
                  ) : null}
                  <span className="flex flex-col">
                    <span className="font-medium">{operation.title}</span>
                    {operation.category ? (
                      <span className="text-xs text-muted-foreground">
                        {operation.category}
                      </span>
                    ) : null}
                  </span>
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {institutionNames[operation.institution_id] ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant={PRIORITY_VARIANT[operation.priority]}>
                  {PRIORITY_LABELS[operation.priority]}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {operation.responsible_person_id
                  ? (personNames[operation.responsible_person_id] ?? "—")
                  : "—"}
              </TableCell>
              <TableCell>
                <DeadlineCell operation={operation} />
              </TableCell>
              <TableCell data-align="right" className="text-muted-foreground">
                {operation.estimated_cost !== null
                  ? formatMoney(operation.estimated_cost)
                  : "—"}
              </TableCell>
              <TableCell data-align="right">
                {operation.actual_cost !== null
                  ? formatMoney(operation.actual_cost)
                  : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[operation.status]}>
                  {STATUS_LABELS[operation.status]}
                </Badge>
              </TableCell>
              <TableCell>
                <ProgressBar value={operation.progress} />
              </TableCell>
              <TableCell data-align="right">
                {canEdit ? (
                  <span onClick={(event) => event.stopPropagation()}>
                    <OperationDialog
                      institutions={institutions}
                      people={people}
                      operation={operation}
                      trigger={
                        <Button size="xs" variant="ghost">
                          <Pencil />
                        </Button>
                      }
                    />
                  </span>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Detail opens beside the list rather than replacing it, so the user
          keeps the queue they were working through. */}
      <Sheet open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent side="right">
          {selected ? (
            <>
              <SheetHeader>
                <div className="flex items-start gap-2 pr-8">
                  {selected.ceo_attention ? (
                    <Star className="mt-1 size-4 shrink-0 fill-brand text-brand" />
                  ) : null}
                  <SheetTitle>{selected.title}</SheetTitle>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={PRIORITY_VARIANT[selected.priority]}>
                    {PRIORITY_LABELS[selected.priority]}
                  </Badge>
                  <Badge variant={STATUS_VARIANT[selected.status]}>
                    {STATUS_LABELS[selected.status]}
                  </Badge>
                  <span className="text-[13px] text-muted-foreground">
                    {institutionNames[selected.institution_id] ?? ""}
                  </span>
                </div>
              </SheetHeader>

              <SheetBody className="flex flex-col gap-5">
                {selected.description ? (
                  <p className="text-[13px] leading-relaxed">{selected.description}</p>
                ) : null}

                {selected.status === "blocked" && selected.blocker ? (
                  <p className="rounded-md border border-critical/35 bg-critical-subtle px-3 py-2 text-[13px] text-critical">
                    <strong>Engel:</strong> {selected.blocker}
                  </p>
                ) : null}

                {selected.ceo_attention && selected.ceo_notes ? (
                  <p className="rounded-md border border-brand/40 bg-brand-subtle px-3 py-2 text-[13px] text-brand">
                    <strong>CEO notu:</strong> {selected.ceo_notes}
                  </p>
                ) : null}

                <div className="grid grid-cols-2 gap-4">
                  <Detail
                    label="Sorumlu"
                    value={
                      selected.responsible_person_id
                        ? (personNames[selected.responsible_person_id] ?? "—")
                        : "Atanmadı"
                    }
                  />
                  <Detail label="Kategori" value={selected.category ?? "—"} />
                  <Detail
                    label="Başlangıç"
                    value={selected.start_date ? formatDate(selected.start_date) : "—"}
                  />
                  <Detail
                    label="Termin"
                    value={<DeadlineCell operation={selected} />}
                  />
                  <Detail
                    label="Tahmini maliyet"
                    value={
                      selected.estimated_cost !== null
                        ? formatMoney(selected.estimated_cost)
                        : "—"
                    }
                  />
                  <Detail
                    label="Gerçek maliyet"
                    value={
                      selected.actual_cost !== null
                        ? formatMoney(selected.actual_cost)
                        : "—"
                    }
                  />
                  {variance ? (
                    <Detail
                      label="Sapma"
                      value={
                        <span
                          className={cn(
                            "tabular",
                            variance.absolute > 0 ? "text-critical" : "text-positive"
                          )}
                        >
                          {variance.absolute > 0 ? "+" : ""}
                          {formatMoney(variance.absolute)}
                          {variance.percent !== null
                            ? ` (${variance.absolute > 0 ? "+" : ""}%${Math.round(variance.percent)})`
                            : ""}
                        </span>
                      }
                    />
                  ) : null}
                  <Detail label="İlerleme" value={<ProgressBar value={selected.progress} />} />
                  <Detail
                    label="Sonraki adım"
                    value={
                      selected.next_action
                        ? `${selected.next_action}${
                            selected.next_action_date
                              ? ` · ${formatDate(selected.next_action_date)}`
                              : ""
                          }`
                        : "—"
                    }
                  />
                  <Detail label="Kimi bekliyor" value={selected.waiting_on ?? "—"} />
                </div>

                <div className="flex flex-col gap-3">
                  <h3 className="label-caps text-muted-foreground">Aktivite geçmişi</h3>

                  {canEdit ? <NoteForm operationId={selected.id} /> : null}

                  <ul className="flex flex-col gap-3 border-l border-border pl-3">
                    {history.length === 0 ? (
                      <li className="text-[13px] text-muted-foreground">
                        Henüz kayıt yok.
                      </li>
                    ) : (
                      history.map((entry) => (
                        <li key={entry.id} className="flex flex-col gap-0.5">
                          <span className="text-[13px]">
                            {entry.kind === "note"
                              ? entry.body
                              : `${entry.body}${
                                  entry.old_value !== null || entry.new_value !== null
                                    ? `: ${describeChange(entry)}`
                                    : ""
                                }`}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {entry.author_name ?? "Sistem"} ·{" "}
                            {formatDateTime(entry.created_at)}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </SheetBody>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Renders a logged field change in the reader's language, not the database's. */
function describeChange(entry: OperationUpdateRow): string {
  const format = (value: unknown): string => {
    if (value === null || value === undefined) return "boş";
    if (typeof value === "boolean") return value ? "evet" : "hayır";
    const text = String(value);
    if (entry.kind === "status") return STATUS_LABELS[text as OperationStatus] ?? text;
    if (entry.kind === "priority")
      return PRIORITY_LABELS[text as OperationPriority] ?? text;
    if (entry.kind === "progress") return `%${text}`;
    if (entry.kind === "deadline") return formatDate(text);
    return text;
  };

  return `${format(entry.old_value)} → ${format(entry.new_value)}`;
}
