import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

/**
 * Platform (super) admins are identified by email listed in
 * PLATFORM_ADMIN_EMAILS (comma-separated). No extra DB table required.
 */
export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function requirePlatformAdmin(): Promise<{ userId: string; email: string }> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login?next=/admin");

  const allowed = platformAdminEmails();
  if (allowed.length === 0 || !allowed.includes(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  return { userId: user.id, email: user.email };
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return platformAdminEmails().includes(email.toLowerCase());
}