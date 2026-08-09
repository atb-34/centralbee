import type { Metadata } from "next";
import Link from "next/link";

import { PermissionMatrix, type ModuleRow } from "./permission-matrix";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can, requirePermission } from "@/lib/auth/viewer";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Roller ve Yetkiler",
};

export default async function AdminRolesPage(props: PageProps<"/admin/roles">) {
  const viewer = await requirePermission(permission(MODULES.adminRoles, "view"));
  const searchParams = await props.searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: roles }, { data: permissions }, { data: rolePermissions }, { data: userRoles }] =
    await Promise.all([
      supabase.from("roles").select("*").order("rank"),
      supabase.from("permissions").select("*").order("sort_order").order("action"),
      supabase.from("role_permissions").select("role_id, permission_id"),
      supabase.from("user_roles").select("role_id"),
    ]);

  const roleRows = roles ?? [];
  const permissionRows = permissions ?? [];

  const requested = typeof searchParams.rol === "string" ? searchParams.rol : undefined;
  const selected =
    roleRows.find((role) => role.key === requested) ??
    roleRows.find((role) => role.key === "executive") ??
    roleRows[0];

  const grantedIds = (rolePermissions ?? [])
    .filter((row) => row.role_id === selected?.id)
    .map((row) => row.permission_id);

  const permissionCountByRole = new Map<string, number>();
  for (const row of rolePermissions ?? []) {
    permissionCountByRole.set(
      row.role_id,
      (permissionCountByRole.get(row.role_id) ?? 0) + 1
    );
  }

  const userCountByRole = new Map<string, number>();
  for (const row of userRoles ?? []) {
    userCountByRole.set(row.role_id, (userCountByRole.get(row.role_id) ?? 0) + 1);
  }

  // Group the flat catalogue into one row per module, preserving sort order.
  const moduleRows: ModuleRow[] = [];
  const moduleIndex = new Map<string, number>();
  for (const row of permissionRows) {
    let index = moduleIndex.get(row.module);
    if (index === undefined) {
      index = moduleRows.length;
      moduleIndex.set(row.module, index);
      moduleRows.push({ module: row.module, label: row.label, cells: [] });
    }
    moduleRows[index].cells.push({ id: row.id, action: row.action });
  }

  const canManage = can(viewer, permission(MODULES.adminPermissions, "manage"));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Roller ve Yetkiler"
        description="Rol, modül ve eylem çiftlerinden oluşan bir demettir. Kurum kapsamı kullanıcı bazında ayrıca belirlenir."
      />

      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Roller</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ul className="flex flex-col gap-0.5">
              {roleRows.map((role) => {
                const isSelected = role.id === selected?.id;
                return (
                  <li key={role.id}>
                    <Link
                      href={`/admin/roles?rol=${role.key}`}
                      className={cn(
                        "flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                        isSelected
                          ? "bg-brand-subtle text-brand"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <span className="font-medium">{role.name}</span>
                      <span className="text-xs opacity-80">
                        {permissionCountByRole.get(role.id) ?? 0} yetki ·{" "}
                        {userCountByRole.get(role.id) ?? 0} kullanıcı
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {selected ? (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{selected.name}</h2>
              <Badge variant="outline" className="font-mono">
                {selected.key}
              </Badge>
              {selected.is_system ? <Badge>Sistem rolü</Badge> : null}
              {selected.key === "super_admin" ? (
                <Badge variant="warning">Salt okunur</Badge>
              ) : null}
            </div>

            {selected.description ? (
              <p className="text-[13px] text-muted-foreground">{selected.description}</p>
            ) : null}

            {!canManage ? (
              <p className="text-[13px] text-muted-foreground">
                Yetkileri görüntülüyorsunuz. Değiştirmek için &quot;Yetkileri
                yönet&quot; izni gerekir.
              </p>
            ) : null}

            <PermissionMatrix
              roleId={selected.id}
              roleName={selected.name}
              readOnly={!canManage || selected.key === "super_admin"}
              modules={moduleRows}
              grantedIds={grantedIds}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
