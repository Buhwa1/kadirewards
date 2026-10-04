import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import { isPlatformAdminEmail } from "./platform-admin";
import type { Business, Program } from "./types";

/** Resolve the signed-in user's business, or send them where they need to go. */
export async function requireBusiness(): Promise<{
  business: Business;
  program: Program | null;
  userId: string;
  role: string;
}> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("business_members")
    .select("role, business:businesses(*)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const business = membership?.business as unknown as Business | undefined;
  if (!business) {
    // Super-admin is platform-only — do not force shop onboarding
    if (isPlatformAdminEmail(user.email)) redirect("/admin");
    redirect("/onboarding");
  }

  const { data: program } = await supabase
    .from("programs")
    .select("*")
    .eq("business_id", business.id)
    .eq("active", true)
    .maybeSingle();

  return {
    business,
    program: (program as Program) ?? null,
    userId: user.id,
    role: membership?.role ?? "owner",
  };
}

export function trialDaysLeft(b: Business) {
  const ms = new Date(b.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}