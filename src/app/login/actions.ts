"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isPlatformAdminEmail } from "@/lib/platform-admin";

export type AuthState = { error?: string; notice?: string };

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  // Platform owner → super-admin dashboard, not a shop
  if (isPlatformAdminEmail(email)) redirect("/admin");
  redirect("/dashboard");
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters for the password." };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };
  if (!data.session) {
    return { notice: "Check your email to confirm the account, then sign in." };
  }

  // Platform owner never creates a shop
  if (isPlatformAdminEmail(email)) redirect("/admin");
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}