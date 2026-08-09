/**
 * Environment access, validated once and in one place.
 *
 * Supabase renamed its browser key from "anon" to "publishable" and its
 * service key to "secret"; both spellings are accepted so the project works
 * with either generation of dashboard.
 */

function required(name: string, ...aliases: string[]): string {
  for (const key of [name, ...aliases]) {
    const value = process.env[key];
    if (value && value.trim().length > 0) return value.trim();
  }
  const looked = [name, ...aliases].join(" veya ");
  throw new Error(
    `Ortam değişkeni eksik: ${looked}. .env.local dosyasını kontrol edin.`
  );
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  );
}

/** Server only. Bypasses RLS — must never reach the browser bundle. */
export function supabaseServiceRoleKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
}

/**
 * Usernames are mapped to a synthetic address on this domain so that Supabase
 * Auth has an email to work with while the user only ever types a username.
 * The domain is never sent mail and does not need to exist.
 */
export function authEmailDomain(): string {
  return process.env.AUTH_EMAIL_DOMAIN?.trim() || "users.centralbee.app";
}
