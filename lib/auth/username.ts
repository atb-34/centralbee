import { authEmailDomain } from "@/lib/env";

/**
 * Username handling.
 *
 * Users never see or type an email address. Supabase Auth is email-based, so
 * each username maps to a synthetic address on a domain that receives no mail.
 *
 * The mapping is deterministic on purpose: sign-in needs no lookup, so an
 * unauthenticated request can never be used to probe which usernames exist.
 */

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export const USERNAME_RULE_TEXT =
  "Kullanıcı adı 3-32 karakter olmalı; küçük harf, rakam, nokta, alt çizgi ve tire kullanılabilir.";

export function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@${authEmailDomain()}`;
}
