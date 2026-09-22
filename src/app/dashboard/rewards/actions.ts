"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/current-business";

function num(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createReward(form: FormData) {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return;

  await supabase.from("rewards").insert({
    business_id: business.id,
    title,
    description: String(form.get("description") ?? "").trim() || null,
    cost_points: num(form.get("cost_points")) ?? 0,
    cost_stamps: num(form.get("cost_stamps")) ?? 0,
    cash_value: num(form.get("cash_value")),
    stock: num(form.get("stock")),
    per_customer_limit: num(form.get("per_customer_limit")),
  });
  revalidatePath("/dashboard/rewards");
}

export async function toggleReward(form: FormData) {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  await supabase
    .from("rewards")
    .update({ active: String(form.get("active")) === "true" })
    .eq("id", String(form.get("id")))
    .eq("business_id", business.id);
  revalidatePath("/dashboard/rewards");
}

export async function deleteReward(form: FormData) {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  await supabase
    .from("rewards")
    .delete()
    .eq("id", String(form.get("id")))
    .eq("business_id", business.id);
  revalidatePath("/dashboard/rewards");
}
