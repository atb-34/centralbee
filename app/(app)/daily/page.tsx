import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CalendarRange, CheckCircle2, Circle, Users } from "lucide-react";

import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can, requirePermission } from "@/lib/auth/viewer";
import { formatCount } from "@/lib/format/number";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Günlük",
};

type SetupStep = {
  label: string;
  detail: string;
  done: boolean;
  href?: string;
  visible: boolean;
};

/**
 * The executive morning review lands here in Phase 8. Until sales and
 * financial data exist there is nothing honest to report, so for now the page
 * answers the only question that currently has an answer: is the system ready
 * to receive data, and what is still missing.
 */
export default async function DailyPage() {
  const viewer = await requirePermission(permission(MODULES.daily, "view"));
  const supabase = await createSupabaseServerClient();

  const [companies, institutions, users, activePeriodResult] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase.from("institutions").select("id", { count: "exact", head: true }),
    can(viewer, permission(MODULES.adminUsers, "view"))
      ? supabase.from("profiles").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: null }),
    supabase
      .from("education_periods")
      .select("short_name, start_date, end_date")
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const activePeriod = activePeriodResult.data;
  const companyCount = companies.count ?? 0;
  const institutionCount = institutions.count ?? 0;
  const userCount = users.count;

  const canManageCompanies = can(viewer, permission(MODULES.adminCompanies, "manage"));
  const canManageInstitutions = can(
    viewer,
    permission(MODULES.adminInstitutions, "manage")
  );
  const canManageUsers = can(viewer, permission(MODULES.adminUsers, "manage"));
  const canManagePeriods = can(
    viewer,
    permission(MODULES.adminEducationPeriods, "manage")
  );

  const steps: SetupStep[] = [
    {
      label: "Eğitim dönemi seçildi",
      detail: activePeriod
        ? `Aktif dönem ${activePeriod.short_name}`
        : "Hiçbir dönem aktif değil",
      done: Boolean(activePeriod),
      href: "/admin/education-periods",
      visible: canManagePeriods,
    },
    {
      label: "Şirketler tanımlandı",
      detail:
        companyCount > 0
          ? `${formatCount(companyCount)} şirket kayıtlı`
          : "Henüz şirket eklenmedi",
      done: companyCount > 0,
      href: "/admin/companies",
      visible: canManageCompanies,
    },
    {
      label: "Kurumlar tanımlandı",
      detail:
        institutionCount > 0
          ? `${formatCount(institutionCount)} kurum kayıtlı`
          : "Henüz kurum eklenmedi",
      done: institutionCount > 0,
      href: "/admin/companies",
      visible: canManageInstitutions,
    },
    {
      label: "Kullanıcılar davet edildi",
      detail:
        (userCount ?? 0) > 1
          ? `${formatCount(userCount ?? 0)} kullanıcı kayıtlı`
          : "Sistemde yalnızca sizin hesabınız var",
      done: (userCount ?? 0) > 1,
      href: "/admin/users",
      visible: canManageUsers,
    },
  ].filter((step) => step.visible);

  const remaining = steps.filter((step) => !step.done);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Günlük"
        description={`Hoş geldiniz, ${viewer.profile.full_name.split(" ")[0]}.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Aktif eğitim dönemi"
          value={activePeriod?.short_name ?? "—"}
          context={
            activePeriod
              ? "1 Eylül – 31 Ağustos"
              : "Yönetim → Eğitim Dönemleri'nden seçin"
          }
        />
        <MetricCard
          label="Şirket"
          value={formatCount(companyCount)}
          context="Kurumların bağlı olduğu tüzel yapılar"
        />
        <MetricCard
          label="Kurum"
          value={formatCount(institutionCount)}
          context="Okul, kurs ve kampüsler"
          href="/institutions"
        />
        {userCount !== null ? (
          <MetricCard
            label="Kullanıcı"
            value={formatCount(userCount)}
            context="Sisteme erişimi olan kişiler"
            href="/admin/users"
          />
        ) : null}
      </div>

      {steps.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-0.5">
              <CardTitle>Kurulum durumu</CardTitle>
              <p className="text-[13px] text-muted-foreground">
                Performans ve finans verisi girilmeden önce tamamlanması gerekenler.
              </p>
            </div>
            <Badge variant={remaining.length === 0 ? "positive" : "warning"}>
              {remaining.length === 0
                ? "Tamamlandı"
                : `${remaining.length} adım kaldı`}
            </Badge>
          </CardHeader>

          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {steps.map((step) => (
                <li
                  key={step.label}
                  className="flex items-center gap-3 px-4 py-3 text-[13px]"
                >
                  {step.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-positive" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}

                  <div className="flex min-w-0 flex-col">
                    <span className={step.done ? "text-muted-foreground" : "font-medium"}>
                      {step.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{step.detail}</span>
                  </div>

                  {!step.done && step.href ? (
                    <Button asChild variant="outline" size="xs" className="ml-auto">
                      <Link href={step.href}>Aç</Link>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Sırada ne var?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-[13px] text-muted-foreground">
          <p>
            Bu ekran Faz 8&apos;de yönetici sabah brifingine dönüşecek: dikkat gerektiren
            başlıklar, kurum performansı, dün ve ay başından bugüne finansal hareket,
            nakit tahmini, CRM ve kritik operasyonlar.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <span className="flex items-center gap-1.5">
              <CalendarRange className="size-3.5" />
              Faz 2 · Kurum profilleri ve düzenli yükümlülükler
            </span>
            <span className="flex items-center gap-1.5">
              <Building2 className="size-3.5" />
              Faz 4 · Veri yükleme altyapısı
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" />
              Faz 5 · Satış, hedef ve canlı sıralama
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
