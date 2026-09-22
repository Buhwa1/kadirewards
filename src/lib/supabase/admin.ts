import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Server-only.
 * Used by the till API and the public customer card, which are authenticated
 * by a signed device cookie / an unguessable card token rather than by a
 * Supabase user, so they cannot rely on RLS.
 */
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
