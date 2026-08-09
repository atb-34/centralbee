import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Service-role client. Bypasses RLS entirely, so it is used only where the
 * platform genuinely requires it: creating auth users, and reading a caller's
 * own effective permissions.
 *
 * Never import this from a Client Component. Callers must have already
 * verified the acting user's permission themselves — this client will not do
 * it for them.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
