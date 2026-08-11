import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  title: "Kurumlar",
};

/**
 * The institution list. RLS decides which rows come back — a manager scoped to
 * one campus sees one row here without this page doing anything about it.
 *
 * Performance, target and financial columns arrive in Phase 5; the shape of
 * the table is built to take them.
 */
export default async function InstitutionsPage() {
  const viewer = await requirePermission(permission(MODULES.institutions, "view"));
  const supabase = await createSupabaseServerClient();

  const { data: institutions } = await supabase
    .from("institutions")
    .select(
      "id, code, name, short_name, institution_type, city, status, company_id, manager_profile_id"
    )
    .order("sort_order")
    .order("name");

  const rows = institutions ?? [];

  const companyIds = [...new Set(rows.map((row) => row.company_id))];
  const managerIds = [
    ...new Set(rows.map((row) => row.manager_profile_id).filter((id): id is string => Boolean(id))),
  ];

  const [{ data: companies }, { data: managers }] = await Promise.all([
    companyIds.length > 0
      ? supabase.from("companies").select("id, code, name").in("id", companyIds)
      : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
    managerIds.length > 0
      ? supabase.from("profiles").select("id, full_name").in("id", managerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  const companyById = new Map((companies ?? []).map((row) => [row.id, row]));
  const managerById = new Map((managers ?? []).map((row) => [row.id, row.full_name]));

  const canManage = can(viewer, permission(MODULES.adminInstitutions, "manage"));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Kurumlar"
        description="Gruba bağlı okul, kurs ve kampüsler."
        actions={
          canManage ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/companies">Kurum yönetimi</Link>
            </Button>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Henüz kurum tanımlanmamış"
          description={
            canManage
              ? "Şirketleri ve kurumları Yönetim bölümünden ekledikten sonra burada listelenecekler."
              : "Kurumlar tanımlandığında burada listelenecekler. Erişiminiz olan kurum yoksa bu liste boş görünür."
          }
          action={
            canManage ? (
              <Button asChild size="sm">
                <Link href="/admin/companies">Kurum ekle</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kurum</TableHead>
                <TableHead>Şirket</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Şehir</TableHead>
                <TableHead>Müdür</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const company = companyById.get(row.company_id);
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/institutions/${row.id}`}
                        className="flex flex-col transition-colors hover:text-brand"
                      >
                        <span className="font-medium">{row.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.code}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {company?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.institution_type ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.city ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.manager_profile_id
                        ? (managerById.get(row.manager_profile_id) ?? "—")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
