import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS — use ONLY in trusted server
 * code (Server Actions, Route Handlers), NEVER in Client Components.
 *
 * Reach for this when you must read/write data the end user is not (and should
 * not be) allowed to touch under RLS — e.g. secrets in `TelegramConfig` or
 * audit rows in `TelegramLogs`.
 *
 * Per the Fluid-compute rule, never hoist this into a module-level singleton;
 * always create it inside the function that needs it.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
