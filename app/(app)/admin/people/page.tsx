import type { Metadata } from "next";
import { Pencil, Plus, Users } from "lucide-react";

import { PersonDialog } from "./person-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
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
  title: "Kişiler",
};

export default async function AdminPeoplePage() {
  const viewer = await requirePermission(permission(MODULES.people, "view"));
  const supabase = await createSupabaseServerClient();

  const [{ data: people }, { data: institutions }] = await Promise.all([
    supabase.from("people").select("*").order("full_name"),
    supabase.from("institutions").select("id, name").order("name"),
  ]);

  const rows = people ?? [];
  const institutionOptions = institutions ?? [];
  const institutionNames = new Map(
    institutionOptions.map((row) => [row.id, row.name])
  );
  const canManage = can(viewer, permission(MODULES.people, "manage"));

  const addButton = canManage ? (
    <PersonDialog
      institutions={institutionOptions}
      trigger={
        <Button size="sm">
          <Plus />
          Kişi ekle
        </Button>
      }
    />
  ) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Kişiler"
        description="Operasyonlarda sorumlu olarak atanabilecek kişiler. Sisteme giriş yapan kullanıcılardan ayrıdır."
        actions={addButton}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Henüz kişi tanımlanmamış"
          description="Bir operasyona sorumlu atayabilmek için önce kişiyi buraya eklemeniz gerekiyor. Müteahhit veya tedarikçi gibi sisteme girmeyen kişiler de eklenebilir."
          action={addButton}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad soyad</TableHead>
                <TableHead>Ünvan</TableHead>
                <TableHead>Kurum</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>E-posta</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((person) => (
                <TableRow key={person.id}>
                  <TableCell className="font-medium">{person.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {person.role_title ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {person.institution_id
                      ? (institutionNames.get(person.institution_id) ?? "—")
                      : "—"}
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {person.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {person.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    {person.is_active ? (
                      <Badge variant="positive">Aktif</Badge>
                    ) : (
                      <Badge>Pasif</Badge>
                    )}
                  </TableCell>
                  <TableCell data-align="right">
                    {canManage ? (
                      <PersonDialog
                        institutions={institutionOptions}
                        person={person}
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
        </Card>
      )}
    </div>
  );
}
