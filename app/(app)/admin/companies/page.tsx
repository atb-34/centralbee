import type { Metadata } from "next";
import { Building2, Pencil, Plus } from "lucide-react";

import { CompanyDialog } from "./company-dialog";
import { InstitutionDialog } from "./institution-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
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
import { can, requirePermission } from "@/lib/auth/viewer";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Şirketler ve Kurumlar",
};

/**
 * Companies and their institutions on one screen. They are always managed
 * together — an institution without a company cannot exist — so splitting
 * them across two pages would only add navigation.
 */
export default async function AdminCompaniesPage() {
  const viewer = await requirePermission(permission(MODULES.adminCompanies, "view"));
  const supabase = await createSupabaseServerClient();

  const [{ data: companies }, { data: institutions }, { data: managers }] =
    await Promise.all([
      supabase.from("companies").select("*").order("sort_order").order("name"),
      supabase.from("institutions").select("*").order("sort_order").order("name"),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name"),
    ]);

  const companyRows = companies ?? [];
  const institutionRows = institutions ?? [];
  const managerOptions = managers ?? [];
  const managerById = new Map(managerOptions.map((row) => [row.id, row.full_name]));

  const companyOptions = companyRows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
  }));

  const canManageCompanies = can(viewer, permission(MODULES.adminCompanies, "manage"));
  const canManageInstitutions = can(
    viewer,
    permission(MODULES.adminInstitutions, "manage")
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Şirketler ve Kurumlar"
        description="Grubun tüzel yapısı ve ona bağlı okul, kurs ve kampüsler."
        actions={
          canManageCompanies ? (
            <CompanyDialog
              trigger={
                <Button size="sm">
                  <Plus />
                  Şirket ekle
                </Button>
              }
            />
          ) : null
        }
      />

      {companyRows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Henüz şirket tanımlanmamış"
          description="Kurum ekleyebilmek için önce en az bir şirket oluşturmanız gerekiyor."
          action={
            canManageCompanies ? (
              <CompanyDialog
                trigger={
                  <Button size="sm">
                    <Plus />
                    İlk şirketi ekle
                  </Button>
                }
              />
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {companyRows.map((company) => {
            const owned = institutionRows.filter(
              (row) => row.company_id === company.id
            );

            return (
              <Card key={company.id}>
                <CardHeader>
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{company.name}</CardTitle>
                      <Badge variant="outline" className="font-mono">
                        {company.code}
                      </Badge>
                      {!company.is_active ? (
                        <Badge variant="warning">Pasif</Badge>
                      ) : null}
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                      {owned.length > 0
                        ? `${owned.length} kurum`
                        : "Bu şirkete bağlı kurum yok"}
                      {company.default_salary_payment_day
                        ? ` · Maaş günü ayın ${company.default_salary_payment_day}'i`
                        : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {canManageCompanies ? (
                      <CompanyDialog
                        company={company}
                        trigger={
                          <Button size="xs" variant="ghost">
                            <Pencil />
                            Düzenle
                          </Button>
                        }
                      />
                    ) : null}

                    {canManageInstitutions ? (
                      <InstitutionDialog
                        companies={companyOptions}
                        managers={managerOptions}
                        defaultCompanyId={company.id}
                        trigger={
                          <Button size="xs" variant="outline">
                            <Plus />
                            Kurum ekle
                          </Button>
                        }
                      />
                    ) : null}
                  </div>
                </CardHeader>

                {owned.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kurum</TableHead>
                        <TableHead>Tür</TableHead>
                        <TableHead>Şehir</TableHead>
                        <TableHead>Müdür</TableHead>
                        <TableHead>Durum</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {owned.map((institution) => (
                        <TableRow key={institution.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{institution.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {institution.code}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {institution.institution_type ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {institution.city ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {institution.manager_profile_id
                              ? (managerById.get(institution.manager_profile_id) ?? "—")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={institution.status} />
                          </TableCell>
                          <TableCell data-align="right">
                            {canManageInstitutions ? (
                              <InstitutionDialog
                                companies={companyOptions}
                                managers={managerOptions}
                                institution={institution}
                                trigger={
                                  <Button size="xs" variant="ghost">
                                    <Pencil />
                                    Düzenle
                                  </Button>
                                }
                              />
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
