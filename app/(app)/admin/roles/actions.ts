"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { can, getViewer } from "@/lib/auth/viewer";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type RolePermissionState = { error?: string; ok?: boolean };

/**
 * Replaces the permission set of one role.
 *
 * `super_admin` is refused: it is the role that can restore any other, so it
 * must not be possible to strip it from inside the app and lock everyone out.
 */
export async function saveRolePermissionsAction(
  _previous: RolePermissionState,
  formData: FormData
): Promise<RolePermissionState> {
  const viewer = await getViewer();
  if (!can(viewer, permission(MODULES.adminPermissions, "manage"))) {
    return { error: "Bu işlem için yetkiniz yok." };
  }

  const roleId = String(formData.get("role_id") ?? "").trim();
  if (!roleId) return { error: "Rol seçilmedi." };

  const admin = createSupabaseAdminClient();

  const { data: role } = await admin
    .from("roles")
    .select("id, key, name")
    .eq("id", roleId)
    .maybeSingle();

  if (!role) return { error: "Rol bulunamadı." };
  if (role.key === "super_admin") {
    return { error: "Süper Yönetici rolünün yetkileri değiştirilemez." };
  }

  const permissionIds = formData
    .getAll("permission_ids")
    .map((value) => String(value))
    .filter(Boolean);

  await admin.from("role_permissions").delete().eq("role_id", roleId);

  if (permissionIds.length > 0) {
    const { error } = await admin.from("role_permissions").insert(
      permissionIds.map((permissionId) => ({
        role_id: roleId,
        permission_id: permissionId,
      }))
    );
    if (error) return { error: `Kaydedilemedi: ${error.message}` };
  }

  await recordAudit({
    actorId: viewer!.id,
    actorUsername: viewer!.profile.username,
    action: "update",
    entityType: "role",
    entityId: roleId,
    summary: `${role.name} rolünün yetkileri güncellendi (${permissionIds.length} yetki)`,
  });

  revalidatePath("/admin/roles");
  return { ok: true };
}
