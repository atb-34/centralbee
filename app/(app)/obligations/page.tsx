import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/viewer";
import {
  OBLIGATION_LABELS,
  costByType,
  groupIntoStreams,
  monthlyFixedCost,
  salarySplit,
  upcomingPayments,
  type UpcomingPayment,
} from "@/lib/calc/obligations";
import { formatDate } from "@/lib/format/date";
import { formatMoney, formatMoneyCompact } from "@/lib/format/money";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Yükümlülükler",
};

const HORIZON_DAYS = 60;

export default async function ObligationsPage(props: PageProps<"/obligations">) {
  await requirePermission(permission(MODULES.institutionObligations, "view"));
  const searchParams = await props.searchParams;
  const companyFilter =
    typeof searchParams.sirket === "string" ? searchParams.sirket : null;

  const supabase = await createSupabaseServerClient();

  // RLS scopes all three: an institution manager granted this permission sees
  // only their own institution's rows, and the totals below are theirs alone.
  const [{ data: obligations }, { data: institutions }, { data: companies }] =
    await Promise.all([
      supabase.from("recurring_obligations").select("*"),
      supabase.from("institutions").select("id, name, company_id").order("name"),
      supabase
        .from("companies")
        .select("id, code, name, default_salary_payment_day")
        .order("sort_order"),
    ]);

  const companyById = new Map((companies ?? []).map((row) => [row.id, row]));
  const visibleInstitutions = (institutions ?? []).filter(
    (institution) => !companyFilter || institution.company_id === companyFilter
  );
  const visibleIds = new Set(visibleInstitutions.map((row) => row.id));
  const rows = (obligations ?? []).filter((row) => visibleIds.has(row.institution_id));

  // One row per institution, plus the payments each one has coming up.
  const perInstitution = visibleInstitutions
    .map((institution) => {
      const streams = groupIntoStreams(
        rows.filter((row) => row.institution_id === institution.id)
      );
      const company = companyById.get(institution.company_id);
      const defaultDay = company?.default_salary_payment_day ?? null;

      return {
        institution,
        company,
        streams,
        monthly: monthlyFixedCost(streams),
        byType: costByType(streams),
        payments: upcomingPayments(streams, defaultDay),
      };
    })
    .filter((entry) => entry.streams.length > 0)
    .sort((a, b) => b.monthly - a.monthly);

  const allStreams = perInstitution.flatMap((entry) => entry.streams);
  const groupMonthly = monthlyFixedCost(allStreams);
  const groupSalary = salarySplit(allStreams);
  const groupByType = costByType(allStreams);

  const upcoming: (UpcomingPayment & { institutionName: string; institutionId: string })[] =
    perInstitution
      .flatMap((entry) =>
        entry.payments.map((payment) => ({
          ...payment,
          institutionName: entry.institution.name,
          institutionId: entry.institution.id,
        }))
      )
      .filter((payment) => payment.daysAway <= HORIZON_DAYS)
      .sort((a, b) => a.dateIso.localeCompare(b.dateIso));

  const upcomingTotal = upcoming.reduce((sum, payment) => sum + payment.amount, 0);

  const filterOptions = [
    { id: null, label: "Tüm şirketler" },
    ...(companies ?? []).map((company) => ({ id: company.id, label: company.name })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Yükümlülükler"
        description="Grubun her ay tekrarlayan sabit giderleri: maaş, kira, SGK, vergi, sigorta."
        actions={
          filterOptions.length > 2 ? (
            <div className="flex flex-wrap gap-1">
              {filterOptions.map((option) => {
                const isActive = option.id === companyFilter;
                return (
                  <Button
                    key={option.id ?? "all"}
                    asChild
                    size="xs"
                    variant={isActive ? "secondary" : "ghost"}
                  >
                    <Link href={option.id ? `/obligations?sirket=${option.id}` : "/obligations"}>
                      {option.label}
                    </Link>
                  </Button>
                );
              })}
            </div>
          ) : null
        }
      />

      {perInstitution.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Henüz yükümlülük tanımlanmamış"
          description="Maaş, kira ve SGK gibi düzenli ödemeler kurum sayfalarından girilir. Girildikçe grubun toplam sabit gideri burada toplanır ve Faz 7'deki nakit tahminini besler."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/institutions">Kurumlara git</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Aylık sabit gider"
              value={formatMoneyCompact(groupMonthly)}
              context={`${perInstitution.length} kurum · ${allStreams.length} kalem`}
            />
            <MetricCard
              label="Maaş"
              value={formatMoneyCompact(groupByType.salary)}
              comparison={
                groupSalary.total > 0
                  ? `${formatMoneyCompact(groupSalary.bank)} banka · ${formatMoneyCompact(groupSalary.cash)} nakit`
                  : undefined
              }
              context={
                groupMonthly > 0
                  ? `Toplamın %${Math.round((groupByType.salary / groupMonthly) * 100)}'i`
                  : undefined
              }
            />
            <MetricCard
              label="Kira"
              value={formatMoneyCompact(groupByType.rent)}
              context={
                groupMonthly > 0
                  ? `Toplamın %${Math.round((groupByType.rent / groupMonthly) * 100)}'i`
                  : undefined
              }
            />
            <MetricCard
              label={`Önümüzdeki ${HORIZON_DAYS} gün`}
              value={formatMoneyCompact(upcomingTotal)}
              comparison={
                upcoming.length > 0
                  ? `${upcoming.length} ödeme · ilki ${formatDate(upcoming[0].dateIso)}`
                  : undefined
              }
              tone={upcoming[0] && upcoming[0].daysAway <= 7 ? "warning" : "neutral"}
              context="Ödeme günü tanımlı kalemler"
            />
          </div>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Kuruma göre</CardTitle>
              <span className="tabular text-[13px] text-muted-foreground">
                Toplam {formatMoney(groupMonthly)} / ay
              </span>
            </CardHeader>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kurum</TableHead>
                  <TableHead>Şirket</TableHead>
                  <TableHead data-align="right">Maaş</TableHead>
                  <TableHead data-align="right">Kira</TableHead>
                  <TableHead data-align="right">Diğer</TableHead>
                  <TableHead data-align="right">Aylık toplam</TableHead>
                  <TableHead>Sıradaki ödeme</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perInstitution.map((entry) => {
                  const other =
                    entry.byType.sgk +
                    entry.byType.tax +
                    entry.byType.insurance +
                    entry.byType.other;
                  const next = entry.payments[0];

                  return (
                    <TableRow key={entry.institution.id}>
                      <TableCell>
                        <Link
                          href={`/institutions/${entry.institution.id}?sekme=yukumlulukler`}
                          className="font-medium transition-colors hover:text-brand"
                        >
                          {entry.institution.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.company?.name ?? "—"}
                      </TableCell>
                      <TableCell data-align="right">
                        {entry.byType.salary > 0 ? formatMoney(entry.byType.salary) : "—"}
                      </TableCell>
                      <TableCell data-align="right">
                        {entry.byType.rent > 0 ? formatMoney(entry.byType.rent) : "—"}
                      </TableCell>
                      <TableCell data-align="right">
                        {other > 0 ? formatMoney(other) : "—"}
                      </TableCell>
                      <TableCell data-align="right" className="font-semibold">
                        {formatMoney(entry.monthly)}
                      </TableCell>
                      <TableCell>
                        {next ? (
                          <span
                            className={cn(
                              "text-[13px]",
                              next.daysAway <= 7 ? "text-warning" : "text-muted-foreground"
                            )}
                          >
                            {formatDate(next.dateIso)}
                            <span className="ml-1.5">
                              {formatMoneyCompact(next.amount)}
                            </span>
                          </span>
                        ) : (
                          <Badge variant="warning">Ödeme günü yok</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {upcoming.length > 0 ? (
            <Card className="overflow-hidden">
              <CardHeader>
                <div className="flex flex-col gap-0.5">
                  <CardTitle>Yaklaşan ödemeler</CardTitle>
                  <p className="text-[13px] text-muted-foreground">
                    Önümüzdeki {HORIZON_DAYS} gün, tarihe göre sıralı.
                  </p>
                </div>
                <span className="tabular text-[13px] font-medium">
                  {formatMoney(upcomingTotal)}
                </span>
              </CardHeader>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Kalan</TableHead>
                    <TableHead>Kurum</TableHead>
                    <TableHead>Kalem</TableHead>
                    <TableHead data-align="right">Tutar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcoming.map((payment, index) => (
                    <TableRow key={`${payment.institutionId}-${payment.stream.type}-${payment.stream.streamName}-${index}`}>
                      <TableCell className="tabular whitespace-nowrap">
                        {formatDate(payment.dateIso)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "tabular",
                          payment.daysAway <= 7 ? "text-warning" : "text-muted-foreground"
                        )}
                      >
                        {payment.daysAway === 0 ? "bugün" : `${payment.daysAway} gün`}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/institutions/${payment.institutionId}?sekme=yukumlulukler`}
                          className="transition-colors hover:text-brand"
                        >
                          {payment.institutionName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {OBLIGATION_LABELS[payment.stream.type]}
                        {payment.stream.streamName ? ` · ${payment.stream.streamName}` : ""}
                      </TableCell>
                      <TableCell data-align="right" className="font-medium">
                        {formatMoney(payment.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
