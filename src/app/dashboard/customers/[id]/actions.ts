"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/current-business";

export async function adjustPoints(form: FormData) {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  const customerId = String(form.get("customer_id"));
  const points = Number(form.get("points") ?? 0);
  const note = String(form.get("note") ?? "").trim() || "Manual adjustment";
  if (!customerId || !Number.isFinite(points) || points === 0) return;

  await supabase.rpc("adjust", {
    p_business: business.id,
    p_customer: customerId,
    p_points: Math.trunc(points),
    p_note: note,
  });
  revalidatePath(`/dashboard/customers/${customerId}`);
}

export async function setBlocked(form: FormData) {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  const customerId = String(form.get("customer_id"));
  const blocked = String(form.get("blocked")) === "true";
  await supabase
    .from("customers")
    .update({ blocked })
    .eq("id", customerId)
    .eq("business_id", business.id);
  revalidatePath(`/dashboard/customers/${customerId}`);
}

export async function updateCustomer(form: FormData) {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  const customerId = String(form.get("customer_id"));
  const name = String(form.get("name") ?? "").trim() || null;
  const birthday = String(form.get("birthday") ?? "") || null;
  const optIn = form.get("whatsapp_opt_in") === "on";
  await supabase
    .from("customers")
    .update({ name, birthday, whatsapp_opt_in: optIn })
    .eq("id", customerId)
    .eq("business_id", business.id);
  revalidatePath(`/dashboard/customers/${customerId}`);
}
