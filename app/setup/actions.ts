"use server";

import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import {
  USERNAME_RULE_TEXT,
  isValidUsername,
  normalizeUsername,
  usernameToAuthEmail,
} from "@/lib/auth/username";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SetupState = { error?: string };

/** True only while the system has no profiles at all. */
export async function setupIsAvailable(): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (error) throw error;
  return (count ?? 0) === 0;
}

/**
 * Creates the first Super Admin.
 *
 * Runs once. The moment a profile exists this action refuses, so the route
 * cannot be used to mint a second privileged account later.
 */
export async function createFirstAdminAction(
  _previous: SetupState,
  formData: FormData
): Promise<SetupState> {
  if (!(await setupIsAvailable())) {
    return { error: "Kurulum zaten tamamlanmış. Giriş ekranını kullanın." };
  }

  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const fullName = String(formData.get("full_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");
  const email = String(formData.get("email") ?? "").trim();

  if (!fullName) return { error: "Ad soyad gerekli." };
  if (!isValidUsername(username)) return { error: USERNAME_RULE_TEXT };
  if (password.length < 10) {
    return { error: "Şifre en az 10 karakter olmalı." };
  }
  if (password !== passwordConfirm) {
    return { error: "Şifreler birbiriyle eşleşmiyor." };
  }

  const admin = createSupabaseAdminClient();

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
    email: email || null,
    is_active: true,
    institution_scope: "all",
  });

  if (profileError) {
    // Leave no half-made account behind.
    await admin.auth.admin.deleteUser(userId);
    return { error: `Profil oluşturulamadı: ${profileError.message}` };
  }

  const { data: superAdminRole } = await admin
    .from("roles")
    .select("id")
    .eq("key", "super_admin")
    .maybeSingle();

  if (!superAdminRole) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    return {
      error:
        "Süper Yönetici rolü veritabanında bulunamadı. Veritabanı göçlerinin çalıştırıldığından emin olun.",
    };
  }

  await admin.from("user_roles").insert({
    user_id: userId,
    role_id: superAdminRole.id,
  });

  await recordAudit({
    actorId: userId,
    actorUsername: username,
    action: "setup",
    entityType: "profile",
    entityId: userId,
    summary: `İlk süper yönetici oluşturuldu: ${username}`,
  });

  redirect("/login?kurulum=tamam");
}
