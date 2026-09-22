"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/current-business";
import { normalizePhone } from "@/lib/phone";

function n(v: FormDataEntryValue | null, fallback: number | null = null) {
  const s = String(v ?? "").trim();
  if (s === "") return fallback;
  const x = Number(s);
  return Number.isFinite(x) ? x : fallback;
}

export async function saveBusiness(form: FormData) {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  await supabase
    .from("businesses")
    .update({
      name: String(form.get("name") ?? business.name).trim(),
      phone: normalizePhone(String(form.get("phone") ?? ""), business.country),
      address: String(form.get("address") ?? "").trim() || null,
      brand_color: String(form.get("brand_color") ?? business.brand_color),
      billing_phone: normalizePhone(String(form.get("billing_phone") ?? ""), business.country),
    })
    .eq("id", business.id);
  revalidatePath("/dashboard/settings");
}

export async function saveProgram(form: FormData) {
  const { business, program } = await requireBusiness();
  if (!program) return;
  const supabase = await supabaseServer();

  await supabase
    .from("programs")
    .update({
      type: String(form.get("type") ?? program.type),
      points_per_currency: (n(form.get("per_thousand"), 1) ?? 1) / 1000,
      stamps_required: n(form.get("stamps_required"), 10) ?? 10,
      stamp_min_spend: n(form.get("stamp_min_spend"), 0) ?? 0,
      points_expire_days: n(form.get("points_expire_days")),
      award_cooldown_minutes: n(form.get("award_cooldown_minutes"), 3) ?? 3,
      max_awards_per_day: n(form.get("max_awards_per_day"), 6) ?? 6,
      max_award_amount: n(form.get("max_award_amount")),
      welcome_bonus: n(form.get("welcome_bonus"), 0) ?? 0,
      birthday_bonus: n(form.get("birthday_bonus"), 0) ?? 0,
      referral_bonus_referrer: n(form.get("referral_bonus_referrer"), 0) ?? 0,
      referral_bonus_referee: n(form.get("referral_bonus_referee"), 0) ?? 0,
    })
    .eq("id", program.id)
    .eq("business_id", business.id);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
}

/**
 * Message switches live in their own form and their own action. An unchecked
 * checkbox simply isn't submitted, so if these shared a form with the earning
 * rules, saving one would silently switch off the other.
 */
export async function saveNotifications(form: FormData) {
  const { business, program } = await requireBusiness();
  if (!program) return;
  const supabase = await supabaseServer();

  await supabase
    .from("programs")
    .update({
      notify_receipt: form.get("notify_receipt") === "on",
      notify_redeem: form.get("notify_redeem") === "on",
      notify_milestone: form.get("notify_milestone") === "on",
      notify_birthday: form.get("notify_birthday") === "on",
      notify_referral: form.get("notify_referral") === "on",
      milestone_points_gap: n(form.get("milestone_points_gap"), 50) ?? 50,
      milestone_stamps_gap: n(form.get("milestone_stamps_gap"), 1) ?? 1,
      milestone_cooldown_days: n(form.get("milestone_cooldown_days"), 30) ?? 30,
    })
    .eq("id", program.id)
    .eq("business_id", business.id);

  revalidatePath("/dashboard/settings");
}

export async function saveTier(form: FormData) {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  const id = String(form.get("id") ?? "");
  const payload = {
    name: String(form.get("name") ?? "").trim(),
    min_points_lifetime: n(form.get("min_points_lifetime"), 0) ?? 0,
    multiplier: n(form.get("multiplier"), 1) ?? 1,
    color: String(form.get("color") ?? "#64748B"),
  };
  if (!payload.name) return;

  if (id) {
    await supabase.from("tiers").update(payload).eq("id", id).eq("business_id", business.id);
  } else {
    await supabase.from("tiers").insert({ ...payload, business_id: business.id });
  }
  revalidatePath("/dashboard/settings");
}

export async function deleteTier(form: FormData) {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  await supabase
    .from("tiers")
    .delete()
    .eq("id", String(form.get("id")))
    .eq("business_id", business.id);
  revalidatePath("/dashboard/settings");
}
