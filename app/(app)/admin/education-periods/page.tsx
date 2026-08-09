import type { Metadata } from "next";

import { ActivateButton } from "./activate-button";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
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
import { formatDate } from "@/lib/format/date";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Eğitim Dönemleri",
};

export default async function EducationPeriodsPage() {
  const viewer = await requirePermission(
    permission(MODULES.adminEducationPeriods, "view")
  );
  const supabase = await createSupabaseServerClient();

  const { data: periods } = await supabase
    .from("education_periods")
    .select("*")
    .order("start_date", { ascending: false });

  const rows = periods ?? [];
  const canManage = can(viewer, permission(MODULES.adminEducationPeriods, "manage"));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Eğitim Dönemleri"
        description="Mali ve akademik yıl 1 Eylül'de başlar, 31 Ağustos'ta biter. Tarihler otomatik olarak doğru döneme eşlenir."
      />

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dönem</TableHead>
              <TableHead>Kısa ad</TableHead>
              <TableHead>Başlangıç</TableHead>
              <TableHead>Bitiş</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((period) => (
              <TableRow key={period.id}>
                <TableCell className="font-medium">{period.name}</TableCell>
                <TableCell className="font-mono">{period.short_name}</TableCell>
                <TableCell className="tabular text-muted-foreground">
                  {formatDate(period.start_date)}
                </TableCell>
                <TableCell className="tabular text-muted-foreground">
                  {formatDate(period.end_date)}
                </TableCell>
                <TableCell>
                  {period.is_active ? (
                    <Badge variant="positive">Aktif</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell data-align="right">
                  {canManage && !period.is_active ? (
                    <ActivateButton periodId={period.id} />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
