import type { Metadata } from "next";
import { KeyRound, Pencil, Plus } from "lucide-react";

import { PasswordDialog } from "./password-dialog";
import {
  UserDialog,
  type EditableUser,
  type InstitutionOption,
  type RoleOption,
} from "./user-dialog";
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
import { formatDateTime } from "@/lib/format/date";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Kullanıcılar",
};

export default async function AdminUsersPage() {
  const viewer = await requirePermission(permission(MODULES.adminUsers, "view"));
  const supabase = await createSupabaseServerClient();

  const [
    { data: profiles },
    { data: roles },
    { data: institutions },
    { data: companies },
    { data: userRoles },
    { data: access },
  ] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("roles").select("id, key, name, description").order("rank"),
    supabase.from("institutions").select("id, name, company_id").order("name"),
    supabase.from("companies").select("id, name"),
    supabase.from("user_roles").select("user_id, role_id"),
    supabase.from("user_institution_access").select("user_id, institution_id"),
  ]);

  const profileRows = profiles ?? [];
  const roleOptions: RoleOption[] = roles ?? [];
  const roleById = new Map(roleOptions.map((role) => [role.id, role]));
  const companyNameById = new Map((companies ?? []).map((row) => [row.id, row.name]));

  const institutionOptions: InstitutionOption[] = (institutions ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    companyName: companyNameById.get(row.company_id) ?? "",
  }));

  const roleIdsByUser = new Map<string, string[]>();
  for (const row of userRoles ?? []) {
    roleIdsByUser.set(row.user_id, [
      ...(roleIdsByUser.get(row.user_id) ?? []),
      row.role_id,
    ]);
  }

  const institutionIdsByUser = new Map<string, string[]>();
  for (const row of access ?? []) {
    institutionIdsByUser.set(row.user_id, [
      ...(institutionIdsByUser.get(row.user_id) ?? []),
      row.institution_id,
    ]);
  }

  const canManage = can(viewer, permission(MODULES.adminUsers, "manage"));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Kullanıcılar"
        description="Sisteme erişimi olan kişiler, rolleri ve görebildikleri kurumlar."
        actions={
          canManage ? (
            <UserDialog
              roles={roleOptions}
              institutions={institutionOptions}
              trigger={
                <Button size="sm">
                  <Plus />
                  Kullanıcı ekle
                </Button>
              }
            />
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kullanıcı</TableHead>
              <TableHead>Roller</TableHead>
              <TableHead>Kurum erişimi</TableHead>
              <TableHead>Son giriş</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {profileRows.map((profile) => {
              const userRoleIds = roleIdsByUser.get(profile.id) ?? [];
              const userInstitutionIds = institutionIdsByUser.get(profile.id) ?? [];

              const editable: EditableUser = {
                id: profile.id,
                username: profile.username,
                full_name: profile.full_name,
                email: profile.email,
                phone: profile.phone,
                title: profile.title,
                is_active: profile.is_active,
                institution_scope: profile.institution_scope,
                roleIds: userRoleIds,
                institutionIds: userInstitutionIds,
              };

              return (
                <TableRow key={profile.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {profile.full_name}
                        {profile.id === viewer.id ? (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            (siz)
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        @{profile.username}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {userRoleIds.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        userRoleIds.map((roleId) => (
                          <Badge key={roleId} variant="outline">
                            {roleById.get(roleId)?.name ?? "?"}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {profile.institution_scope === "all"
                      ? "Tüm kurumlar"
                      : userInstitutionIds.length > 0
                        ? `${userInstitutionIds.length} kurum`
                        : "Kurum atanmamış"}
                  </TableCell>

                  <TableCell className="tabular text-muted-foreground">
                    {profile.last_login_at ? formatDateTime(profile.last_login_at) : "—"}
                  </TableCell>

                  <TableCell>
                    {profile.is_active ? (
                      <Badge variant="positive">Aktif</Badge>
                    ) : (
                      <Badge variant="critical">Devre dışı</Badge>
                    )}
                  </TableCell>

                  <TableCell data-align="right">
                    {canManage ? (
                      <div className="flex items-center justify-end gap-1">
                        <PasswordDialog
                          userId={profile.id}
                          username={profile.username}
                          trigger={
                            <Button size="xs" variant="ghost">
                              <KeyRound />
                              Şifre
                            </Button>
                          }
                        />
                        <UserDialog
                          roles={roleOptions}
                          institutions={institutionOptions}
                          user={editable}
                          trigger={
                            <Button size="xs" variant="ghost">
                              <Pencil />
                              Düzenle
                            </Button>
                          }
                        />
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
