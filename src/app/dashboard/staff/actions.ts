"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireBusiness } from "@/lib/current-business";

export async function addStaff(form: FormData) {
  const { business } = await requireBusiness();
  const name = String(form.get("name") ?? "").trim();
  const pin = String(form.get("pin") ?? "").trim();
  if (!name || !/^\d{4}$/.test(pin)) return;

  const admin = supabaseAdmin();
  const { data } = await admin
    .from("staff")
    .insert({ business_id: business.id, name })
    .select()
    .single();
  if (data) await admin.rpc("set_staff_pin", { p_staff: data.id, p_pin: pin });
  revalidatePath("/dashboard/staff");
}

export async function resetPin(form: FormData) {
  const { business } = await requireBusiness();
  const id = String(form.get("id"));
  const pin = String(form.get("pin") ?? "").trim();
  if (!/^\d{4}$/.test(pin)) return;

  const admin = supabaseAdmin();
  // confirm the row belongs to this business before touching it
  const { data: row } = await admin
    .from("staff")
    .select("id")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!row) return;

  await admin.rpc("set_staff_pin", { p_staff: id, p_pin: pin });
  revalidatePath("/dashboard/staff");
}

export async function toggleStaff(form: FormData) {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  await supabase
    .from("staff")
    .update({ active: String(form.get("active")) === "true" })
    .eq("id", String(form.get("id")))
    .eq("business_id", business.id);
  revalidatePath("/dashboard/staff");
}
