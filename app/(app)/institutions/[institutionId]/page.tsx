import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, Lock } from "lucide-react";

import { ObligationsPanel } from "./obligations-panel";
import { OperationsBoard } from "@/app/(app)/operations/operations-board";
import { sortOperations } from "@/lib/calc/operations";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can, requirePermission } from "@/lib/auth/viewer";
import { formatDate } from "@/lib/format/date";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Kurum",
};

/**
 * Tabs are links, not client state: the URL carries which one is open, so a
 * tab can be bookmarked and shared. Only the tabs that exist today are listed;
 * Performans, Finansal, Operasyon, Bütçe, Reklam and Ziyaretler arrive with
 * the phases that give them something to show.
 */
const TABS = [
  { key: "genel", label: "Genel Bakış" },
  { key: "yukumlulukler", label: "Yükümlülükler" },
  { key: "operasyon", label: "Operasyon" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-caps text-muted-foreground">{label}</span>
      <span className="text-[13px]">{value}</span>
    </div>
  );
}

export default async function InstitutionDetailPage(
  props: PageProps<"/institutions/[institutionId]">
) {
  const viewer = await requirePermission(permission(MODULES.institutions, "view"));
  const { institutionId } = await props.params;
  const searchParams = await props.searchParams;

  const supabase = await createSupabaseServerClient();

  // RLS decides this, not the page: an institution outside the viewer's scope
  // simply is not there.
  const { data: institution } = await supabase
    .from("institutions")
    .select("*")
    .eq("id", institutionId)
    .maybeSingle();

  if (!institution) notFound();

  const requested = typeof searchParams.sekme === "string" ? searchParams.sekme : "";
  const activeTab: TabKey = TABS.some((tab) => tab.key === requested)
    ? (requested as TabKey)
    : "genel";

  const canViewObligations = can(
    viewer,
    permission(MODULES.institutionObligations, "view")
  );
  const canEditObligations =
    can(viewer, permission(MODULES.institutionObligations, "edit")) ||
    can(viewer, permission(MODULES.institutionObligations, "create"));

  const canViewOperations = can(viewer, permission(MODULES.operations, "view"));

  const [
    { data: company },
    { data: manager },
    { data: obligations },
    { data: operationRowsData },
    { data: operationPeople },
  ] = await Promise.all([
      supabase
        .from("companies")
        .select("id, code, name, default_salary_payment_day")
        .eq("id", institution.company_id)
        .maybeSingle(),
      institution.manager_profile_id
        ? supabase
            .from("profiles")
            .select("id, full_name, title, phone")
            .eq("id", institution.manager_profile_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      canViewObligations
        ? supabase
            .from("recurring_obligations")
            .select("*")
            .eq("institution_id", institutionId)
            .order("effective_from", { ascending: false })
        : Promise.resolve({ data: [] }),
      canViewOperations
        ? supabase.from("operations").select("*").eq("institution_id", institutionId)
        : Promise.resolve({ data: [] }),
      canViewOperations && can(viewer, permission(MODULES.people, "view"))
        ? supabase
            .from("people")
            .select("id, full_name")
            .eq("is_active", true)
            .order("full_name")
        : Promise.resolve({ data: [] }),
    ]);

  const operationRows = operationRowsData ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link
          href="/institutions"
          className="flex w-fit items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Kurumlar
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">
                {institution.name}
              </h1>
              <Badge variant="outline" className="font-mono">
                {institution.code}
              </Badge>
              <StatusBadge status={institution.status} />
            </div>
            <p className="text-[13px] text-muted-foreground">
              {company?.name ?? "—"}
              {institution.institution_type ? ` · ${institution.institution_type}` : ""}
              {institution.city ? ` · ${institution.city}` : ""}
            </p>
          </div>

          {can(viewer, permission(MODULES.adminInstitutions, "manage")) ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/companies">Kurum bilgilerini düzenle</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <nav className="flex h-9 items-center gap-1 border-b border-border">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <Link
              key={tab.key}
              href={`/institutions/${institutionId}?sekme=${tab.key}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex items-center border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
                isActive
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {activeTab === "genel" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Kurum bilgileri</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Fact label="Şirket" value={company?.name ?? "—"} />
              <Fact label="Kod" value={<span className="font-mono">{institution.code}</span>} />
              <Fact label="Tür" value={institution.institution_type ?? "—"} />
              <Fact
                label="Konum"
                value={
                  [institution.district, institution.city].filter(Boolean).join(", ") ||
                  "—"
                }
              />
              <Fact
                label="Açılış"
                value={institution.opened_on ? formatDate(institution.opened_on) : "—"}
              />
              <Fact label="Kısa ad" value={institution.short_name ?? "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Yönetim</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Fact label="Müdür" value={manager?.full_name ?? "Atanmadı"} />
              <Fact label="Ünvan" value={manager?.title ?? "—"} />
              <Fact label="Telefon" value={manager?.phone ?? "—"} />
              <Fact
                label="Maaş günü"
                value={
                  company?.default_salary_payment_day
                    ? `Ayın ${company.default_salary_payment_day}'i (şirket varsayılanı)`
                    : "Tanımsız"
                }
              />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Sırada ne var?</CardTitle>
            </CardHeader>
            <CardContent className="text-[13px] text-muted-foreground">
              Performans, Finansal, Operasyon, Bütçe, Reklam ve Ziyaretler sekmeleri
              ilgili fazlarla birlikte açılacak. Gösterecek verisi olmayan bir sekme
              eklemek, olmayan sekmeden kötüdür.
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === "operasyon" ? (
        canViewOperations ? (
          operationRows.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Bu kurumda açık iş yok"
              description="Tadilat, bakım ve izin süreçleri Operasyon bölümünden takip edilir."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/operations">Operasyona git</Link>
                </Button>
              }
            />
          ) : (
            <Card className="overflow-hidden">
              <OperationsBoard
                operations={sortOperations(operationRows)}
                institutionNames={{ [institutionId]: institution.name }}
                personNames={Object.fromEntries(
                  (operationPeople ?? []).map((row) => [row.id, row.full_name])
                )}
                updatesByOperation={{}}
                institutions={[{ id: institutionId, name: institution.name }]}
                people={(operationPeople ?? []).map((row) => ({
                  id: row.id,
                  name: row.full_name,
                }))}
                canEdit={can(viewer, permission(MODULES.operations, "edit"))}
              />
            </Card>
          )
        ) : (
          <EmptyState
            icon={Lock}
            title="Operasyonları görme yetkiniz yok"
            description="Bu bölüm için yetkiniz tanımlı değil. Sistem yöneticinizden talep edebilirsiniz."
          />
        )
      ) : null}

      {activeTab === "yukumlulukler" ? (
        canViewObligations ? (
          <ObligationsPanel
            institutionId={institutionId}
            companyDefaultDay={company?.default_salary_payment_day ?? null}
            rows={obligations ?? []}
            canEdit={canEditObligations}
          />
        ) : (
          <EmptyState
            icon={Lock}
            title="Yükümlülükleri görme yetkiniz yok"
            description="Maaş, kira ve SGK gibi kalemler para verisidir ve ayrı bir yetkiyle korunur. İhtiyacınız varsa sistem yöneticinizden talep edebilirsiniz."
          />
        )
      ) : null}
    </div>
  );
}
