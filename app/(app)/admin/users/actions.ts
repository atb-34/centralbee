"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import {
  USERNAME_RULE_TEXT,
  isValidUsername,
  normalizeUsername,
  usernameToAuthEmail,
} from "@/lib/auth/username";
import { can, getViewer } from "@/lib/auth/viewer";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { InstitutionScope } from "@/types/database";

export type UserFormState = { error?: string; ok?: boolean };

const MIN_PASSWORD_LENGTH = 10;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function ids(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((value) => String(value))
    .filter(Boolean);
}

/**
 * Replaces a user's role and institution assignments.
 *
 * Written with the service role because these tables are the mechanism the
 * caller's own permission is derived from; the caller's `admin.users:manage`
 * has already been verified before we get here.
 */
async function syncAssignments(
  userId: string,
  roleIds: string[],
  institutionIds: string[],
  scope: InstitutionScope
) {
  const admin = createSupabaseAdminClient();

  await admin.from("user_roles").delete().eq("user_id", userId);
  if (roleIds.length > 0) {
    await admin
      .from("user_roles")
      .insert(roleIds.map((roleId) => ({ user_id: userId, role_id: roleId })));
  }

  await admin.from("user_institution_access").delete().eq("user_id", userId);
  // An explicit list is meaningless when the user may see everything.
  if (scope === "specific" && institutionIds.length > 0) {
    await admin.from("user_institution_access").insert(
      institutionIds.map((institutionId) => ({
        user_id: userId,
        institution_id: institutionId,
      }))
    );
  }
}

export async function createUserAction(
  _previous: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const viewer = await getViewer();
  if (!can(viewer, permission(MODULES.adminUsers, "manage"))) {
    return { error: "Bu işlem için yetkiniz yok." };
  }

  const username = normalizeUsername(text(formData, "username"));
  const fullName = text(formData, "full_name");
  const password = text(formData, "password");
  const scope = (text(formData, "institution_scope") || "specific") as InstitutionScope;

  if (!fullName) return { error: "Ad soyad gerekli." };
  if (!isValidUsername(username)) return { error: USERNAME_RULE_TEXT };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.` };
  }

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existing) {
    return { error: `"${username}" kullanıcı adı zaten alınmış.` };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: usernameToAuthEmail(username),
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName },
  });

  if (createError || !created.user) {
    return {
      error: `Kullanıcı oluşturulamadı: ${createError?.message ?? "bilinmeyen hata"}`,
    };
  }

  const userId = created.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    username,
    full_name: fullName,
    email: optionalText(formData, "email"),
    phone: optionalText(formData, "phone"),
    title: optionalText(formData, "title"),
    is_active: true,
    institution_scope: scope,
  });

  if (profileError) {
    // Do not leave an auth account without a profile — it could never sign in
    // but would block the username forever.
    await admin.auth.admin.deleteUser(userId);
    return { error: `Profil oluşturulamadı: ${profileError.message}` };
  }

  await syncAssignments(
    userId,
    ids(formData, "role_ids"),
    ids(formData, "institution_ids"),
    scope
  );

  await recordAudit({
    actorId: viewer!.id,
    actorUsername: viewer!.profile.username,
    action: "create",
    entityType: "profile",
    entityId: userId,
    summary: `Kullanıcı oluşturuldu: ${username} (${fullName})`,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateUserAction(
  _previous: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const viewer = await getViewer();
  if (!can(viewer, permission(MODULES.adminUsers, "manage"))) {
    return { error: "Bu işlem için yetkiniz yok." };
  }

  const userId = text(formData, "id");
  if (!userId) return { error: "Kullanıcı bulunamadı." };

  const fullName = text(formData, "full_name");
  if (!fullName) return { error: "Ad soyad gerekli." };

  const scope = (text(formData, "institution_scope") || "specific") as InstitutionScope;
  const isActive = formData.get("is_active") === "on";

  // Locking yourself out of the system is never the intended action.
  if (userId === viewer!.id && !isActive) {
    return { error: "Kendi hesabınızı devre dışı bırakamazsınız." };
  }

  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      email: optionalText(formData, "email"),
      phone: optionalText(formData, "phone"),
      title: optionalText(formData, "title"),
      institution_scope: scope,
      is_active: isActive,
    })
    .eq("id", userId);

  if (error) return { error: `Kaydedilemedi: ${error.message}` };

  const roleIds = ids(formData, "role_ids");

  // The same guard for roles: an admin must not be able to strip their own
  // last role and lose access to this screen.
  if (userId === viewer!.id && roleIds.length === 0) {
    return { error: "Kendi rollerinizin tamamını kaldıramazsınız." };
  }

  await syncAssignments(userId, roleIds, ids(formData, "institution_ids"), scope);

  await recordAudit({
    actorId: viewer!.id,
    actorUsername: viewer!.profile.username,
    action: "update",
    entityType: "profile",
    entityId: userId,
    summary: `Kullanıcı güncellendi: ${fullName}`,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function resetPasswordAction(
  _previous: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const viewer = await getViewer();
  if (!can(viewer, permission(MODULES.adminUsers, "manage"))) {
    return { error: "Bu işlem için yetkiniz yok." };
  }

  const userId = text(formData, "id");
  const password = text(formData, "password");
  const passwordConfirm = text(formData, "password_confirm");

  if (!userId) return { error: "Kullanıcı bulunamadı." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.` };
  }
  if (password !== passwordConfirm) {
    return { error: "Şifreler birbiriyle eşleşmiyor." };
  }

  const admin = createSupabaseAdminClient();

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { error: `Şifre değiştirilemedi: ${error.message}` };

  const { data: profile } = await admin
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  await recordAudit({
    actorId: viewer!.id,
    actorUsername: viewer!.profile.username,
    action: "password_reset",
    entityType: "profile",
    entityId: userId,
    // The password itself is never written anywhere, including here.
    summary: `${profile?.username ?? userId} için şifre sıfırlandı`,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}
