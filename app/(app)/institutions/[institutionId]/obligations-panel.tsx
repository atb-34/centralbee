import { ChevronRight, Plus, Wallet } from "lucide-react";

import { ObligationDialog } from "./obligation-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { MetricCard } from "@/components/app/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  INCREASE_RULE_LABELS,
  OBLIGATION_LABELS,
  groupIntoStreams,
  monthlyFixedCost,
  resolvePaymentDay,
  salarySplit,
  upcomingPayments,
} from "@/lib/calc/obligations";
import { formatDate } from "@/lib/format/date";
import { formatMoney, formatMoneyCompact } from "@/lib/format/money";
import type { RecurringObligationRow } from "@/types/database";

function DayLabel({
  day,
  inherited,
}: {
  day: number | null;
  inherited: boolean;
}) {
  if (day === null) {
    return <span className="text-warning">Ödeme günü tanımsız</span>;
  }
  return (
    <span>
      Ayın {day}&apos;i
      {inherited ? (
        <span className="ml-1 text-muted-foreground">(şirket varsayılanı)</span>
      ) : null}
    </span>
  );
}

export function ObligationsPanel({
  institutionId,
  companyDefaultDay,
  rows,
  canEdit,
}: {
  institutionId: string;
  companyDefaultDay: number | null;
  rows: RecurringObligationRow[];
  canEdit: boolean;
}) {
  const streams = groupIntoStreams(rows);
  const active = streams.filter((stream) => stream.current !== null);
  const monthlyTotal = monthlyFixedCost(streams);
  const salary = salarySplit(streams);
  const upcoming = upcomingPayments(streams, companyDefaultDay);

  const addButton = canEdit ? (
    <ObligationDialog
      institutionId={institutionId}
      companyDefaultDay={companyDefaultDay}
      trigger={
        <Button size="sm">
          <Plus />
          Yükümlülük ekle
        </Button>
      }
    />
  ) : null;

  if (streams.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Bu kurum için yükümlülük tanımlanmamış"
        description="Maaş, kira, SGK ve vergi gibi her ay tekrarlayan ödemeler burada tutulur. Nakit tahmini bu kayıtlardan beslenecek."
        action={addButton}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Aylık sabit gider"
          value={formatMoneyCompact(monthlyTotal)}
          context={`${active.length} yürürlükteki yükümlülük`}
        />
        {salary.total > 0 ? (
          <MetricCard
            label="Maaş · banka / nakit"
            value={formatMoneyCompact(salary.total)}
            comparison={`${formatMoneyCompact(salary.bank)} banka · ${formatMoneyCompact(salary.cash)} nakit`}
            context="Nakit kısmı kasadan çıkar"
          />
        ) : null}
        {upcoming.length > 0 ? (
          <MetricCard
            label="Sıradaki ödeme"
            value={formatMoneyCompact(upcoming[0].amount)}
            comparison={formatDate(upcoming[0].dateIso)}
            tone={upcoming[0].daysAway <= 7 ? "warning" : "neutral"}
            context={`${OBLIGATION_LABELS[upcoming[0].stream.type]} · ${
              upcoming[0].daysAway === 0
                ? "bugün"
                : `${upcoming[0].daysAway} gün sonra`
            }`}
          />
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-0.5">
            <CardTitle>Yükümlülükler</CardTitle>
            <p className="text-[13px] text-muted-foreground">
              Tutar değiştiğinde eski kayıt silinmez; yeni bir sürüm açılır.
            </p>
          </div>
          {addButton}
        </CardHeader>

        <ul className="divide-y divide-border">
          {streams.map((stream) => {
            const current = stream.current;
            const history = stream.versions.filter((row) => row !== current);
            const paymentDay = current
              ? resolvePaymentDay(current, companyDefaultDay)
              : null;
            const inherited = Boolean(current && current.payment_day === null);

            return (
              <li
                key={`${stream.type}|${stream.streamName}`}
                className="flex flex-col gap-2 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {OBLIGATION_LABELS[stream.type]}
                      </span>
                      {stream.streamName ? (
                        <Badge variant="outline">{stream.streamName}</Badge>
                      ) : null}
                      {current ? null : <Badge variant="default">Sona ermiş</Badge>}
                      {current && current.increase_rule !== "none" ? (
                        <Badge variant="info">
                          {INCREASE_RULE_LABELS[current.increase_rule]}
                          {current.increase_rule === "fixed_percent" &&
                          current.increase_rate !== null
                            ? ` %${current.increase_rate}`
                            : ""}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {current ? (
                        <>
                          <DayLabel day={paymentDay} inherited={inherited} />
                          {current.counterparty ? (
                            <span>{current.counterparty}</span>
                          ) : null}
                          <span>
                            {formatDate(current.effective_from)} tarihinden beri
                          </span>
                        </>
                      ) : (
                        <span>
                          Son sürüm {formatDate(stream.versions[0]?.effective_to)}{" "}
                          tarihinde sona erdi
                        </span>
                      )}
                    </div>

                    {current && stream.type === "salary" && current.amount_bank !== null ? (
                      <p className="text-xs text-muted-foreground">
                        Banka {formatMoney(current.amount_bank)} · Nakit{" "}
                        {formatMoney(current.amount_cash)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="tabular text-sm font-semibold">
                      {current ? formatMoney(current.amount_total) : "—"}
                    </span>
                    {canEdit ? (
                      <ObligationDialog
                        institutionId={institutionId}
                        companyDefaultDay={companyDefaultDay}
                        existing={{
                          type: stream.type,
                          streamName: stream.streamName,
                          current,
                        }}
                        trigger={
                          <Button size="xs" variant="outline">
                            Yeni sürüm
                          </Button>
                        }
                      />
                    ) : null}
                  </div>
                </div>

                {history.length > 0 ? (
                  <details className="group">
                    <summary className="flex w-fit cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
                      {history.length} önceki sürüm
                    </summary>

                    <ul className="mt-2 flex flex-col gap-1 border-l border-border pl-3">
                      {history.map((version) => (
                        <li
                          key={version.id}
                          className="flex flex-wrap items-baseline justify-between gap-2 text-xs"
                        >
                          <span className="text-muted-foreground">
                            {formatDate(version.effective_from)} –{" "}
                            {version.effective_to
                              ? formatDate(version.effective_to)
                              : "açık"}
                            {version.counterparty ? ` · ${version.counterparty}` : ""}
                          </span>
                          <span className="tabular">
                            {formatMoney(version.amount_total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Yaklaşan ödemeler</CardTitle>
            <span className="text-[13px] text-muted-foreground">
              Toplam {formatMoneyCompact(upcoming.reduce((s, p) => s + p.amount, 0))}
            </span>
          </CardHeader>
          <ul className="divide-y divide-border">
            {upcoming.map((payment) => (
              <li
                key={`${payment.stream.type}|${payment.stream.streamName}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">
                    {OBLIGATION_LABELS[payment.stream.type]}
                  </span>
                  {payment.stream.streamName ? (
                    <span className="text-muted-foreground">
                      {payment.stream.streamName}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-3">
                  <span
                    className={
                      payment.daysAway <= 7 ? "text-warning" : "text-muted-foreground"
                    }
                  >
                    {formatDate(payment.dateIso)}
                    {payment.daysAway === 0
                      ? " · bugün"
                      : ` · ${payment.daysAway} gün`}
                  </span>
                  <span className="tabular font-medium">
                    {formatMoney(payment.amount)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
