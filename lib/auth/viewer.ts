import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/database";

/**
 * Everything the server needs to know about who is asking.
 *
 * Held for the duration of one request via React `cache`, so a layout, a page
 * and three components asking "can this user see X?" cost one set of queries.
 *
 * Queries are deliberately flat rather than embedded: the joins happen here in
 * TypeScript, which keeps the shapes honest against a hand-maintained schema.
 */
export type Viewer = {
  id: string;
  profile: ProfileRow;
  roleKeys: string[];
  isSuperAdmin: boolean;
  /** Effective permission keys, overrides already applied. */
  permissions: ReadonlySet<string>;
  /** True when the user may see every institution. */
  scopeAll: boolean;
  /** Only meaningful when `scopeAll` is false. */
  institutionIds: string[];
};

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // No profile, or deactivated: treated exactly like signed out.
  if (!profile || !profile.is_active) return null;

  const [
    { data: userRoleRows },
    { data: overrideRows },
    { data: accessRows },
    { data: permissionRows },
  ] = await Promise.all([
    supabase.from("user_roles").select("role_id").eq("user_id", user.id),
    supabase
      .from("user_permission_overrides")
      .select("permission_id, granted")
      .eq("user_id", user.id),
    supabase
      .from("user_institution_access")
      .select("institution_id")
      .eq("user_id", user.id),
    // The catalogue is fixed reference data of well under a hundred rows.
    supabase.from("permissions").select("id, key"),
  ]);

  const roleIds = (userRoleRows ?? []).map((row) => row.role_id);
  const permissionKeyById = new Map(
    (permissionRows ?? []).map((row) => [row.id, row.key])
  );

  let roleKeys: string[] = [];
  const permissions = new Set<string>();

  if (roleIds.length > 0) {
    const [{ data: roleRows }, { data: rolePermissionRows }] = await Promise.all([
      supabase.from("roles").select("key").in("id", roleIds),
      supabase.from("role_permissions").select("permission_id").in("role_id", roleIds),
    ]);

    roleKeys = (roleRows ?? []).map((row) => row.key);

    for (const row of rolePermissionRows ?? []) {
      const key = permissionKeyById.get(row.permission_id);
      if (key) permissions.add(key);
    }
  }

  // A per-user override replaces whatever the roles said, in either direction.
  for (const row of overrideRows ?? []) {
    const key = permissionKeyById.get(row.permission_id);
    if (!key) continue;
    if (row.granted) permissions.add(key);
    else permissions.delete(key);
  }

  return {
    id: user.id,
    profile,
    roleKeys,
    isSuperAdmin: roleKeys.includes("super_admin"),
    permissions,
    scopeAll: profile.institution_scope === "all",
    institutionIds: (accessRows ?? []).map((row) => row.institution_id),
  };
});

export function can(viewer: Viewer | null, permissionKey: string): boolean {
  if (!viewer) return false;
  if (viewer.isSuperAdmin) return true;
  return viewer.permissions.has(permissionKey);
}

export function canAny(viewer: Viewer | null, permissionKeys: string[]): boolean {
  return permissionKeys.some((key) => can(viewer, key));
}

export function canAccessInstitution(
  viewer: Viewer | null,
  institutionId: string
): boolean {
  if (!viewer) return false;
  if (viewer.isSuperAdmin || viewer.scopeAll) return true;
  return viewer.institutionIds.includes(institutionId);
}

/** For pages: sends anyone not signed in to the login screen. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

/**
 * For pages behind a permission. Redirects rather than rendering an empty
 * shell — the sidebar already hides what the user cannot reach, so landing
 * here means a typed URL or a stale link.
 */
export async function requirePermission(permissionKey: string): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!can(viewer, permissionKey)) redirect("/yetkisiz");
  return viewer;
}
