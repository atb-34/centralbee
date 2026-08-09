"use server";

import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import { getLandingPath } from "@/lib/auth/landing";
import { isValidUsername, normalizeUsername, usernameToAuthEmail } from "@/lib/auth/username";
import { getViewer } from "@/lib/auth/viewer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

/**
 * Sign-in.
 *
 * Every failure returns the same message. Telling the caller whether the
 * username exists would turn this form into a directory of staff accounts.
 */
const GENERIC_FAILURE = "Kullanıcı adı veya şifre hatalı.";

export async function loginAction(
  _previous: LoginState,
  formData: FormData
): Promise<LoginState> {
  const rawUsername = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const username = normalizeUsername(rawUsername);

  if (!username || !password) {
    return { error: "Kullanıcı adı ve şifre gerekli." };
  }

  if (!isValidUsername(username)) {
    return { error: GENERIC_FAILURE };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToAuthEmail(username),
    password,
  });

  if (error || !data.user) {
    return { error: GENERIC_FAILURE };
  }

  // A deactivated account may still hold valid credentials. The profile flag
  // is what decides, so check it before letting the session stand.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return {
      error: "Bu hesap devre dışı bırakılmış. Yöneticinizle görüşün.",
    };
  }

  // Written with the service role: recording a login is not something the
  // user themselves has permission to do.
  const admin = createSupabaseAdminClient();
  await admin
    .from("profiles")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", profile.id);

  await recordAudit({
    actorId: profile.id,
    actorUsername: profile.username,
    action: "login",
    entityType: "auth",
    entityId: profile.id,
    summary: `${profile.username} sisteme giriş yaptı`,
  });

  // Send the user to the first screen their roles actually open, rather than
  // assuming everyone can see Günlük.
  const viewer = await getViewer();
  redirect(viewer ? getLandingPath(viewer) : "/daily");
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    await recordAudit({
      actorId: user.id,
      actorUsername: profile?.username ?? null,
      action: "logout",
      entityType: "auth",
      entityId: user.id,
      summary: `${profile?.username ?? "Kullanıcı"} çıkış yaptı`,
    });
  }

  await supabase.auth.signOut();
  redirect("/login");
}
