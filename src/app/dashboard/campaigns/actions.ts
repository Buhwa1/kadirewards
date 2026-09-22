"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireBusiness } from "@/lib/current-business";

export async function createMultiplier(form: FormData) {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  const days = form.getAll("days").map((d) => Number(d));

  await supabase.from("campaigns").insert({
    business_id: business.id,
    name: String(form.get("name") ?? "Happy hour").trim(),
    kind: "multiplier",
    multiplier: Number(form.get("multiplier") ?? 2),
    days_of_week: days.length ? days : null,
    hour_start: form.get("hour_start") ? Number(form.get("hour_start")) : null,
    hour_end: form.get("hour_end") ? Number(form.get("hour_end")) : null,
    ends_at: String(form.get("ends_at") ?? "") || null,
  });
  revalidatePath("/dashboard/campaigns");
}

export async function toggleCampaign(form: FormData) {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  await supabase
    .from("campaigns")
    .update({ active: String(form.get("active")) === "true" })
    .eq("id", String(form.get("id")))
    .eq("business_id", business.id);
  revalidatePath("/dashboard/campaigns");
}

export async function deleteCampaign(form: FormData) {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  await supabase
    .from("campaigns")
    .delete()
    .eq("id", String(form.get("id")))
    .eq("business_id", business.id);
  revalidatePath("/dashboard/campaigns");
}

/**
 * Queue a WhatsApp broadcast to a segment. Writes into the outbox; the drain
 * route sends it. Opted-out and phone-less customers are skipped by design.
 */
export async function sendBroadcast(form: FormData) {
  const { business } = await requireBusiness();
  const admin = supabaseAdmin();
  const message = String(form.get("message") ?? "").trim();
  const audience = String(form.get("audience") ?? "all");
  if (!message) return;

  let q = admin
    .from("customers")
    .select("id, phone, whatsapp_opt_in")
    .eq("business_id", business.id)
    .eq("whatsapp_opt_in", true)
    .eq("blocked", false)
    .not("phone", "is", null);

  const now = Date.now();
  if (audience === "lapsed") q = q.lt("last_visit_at", new Date(now - 60 * 864e5).toISOString());
  if (audience === "active") q = q.gt("last_visit_at", new Date(now - 30 * 864e5).toISOString());
  if (audience === "new") q = q.gt("created_at", new Date(now - 30 * 864e5).toISOString());

  const { data: recipients } = await q.limit(5000);
  if (!recipients?.length) return;

  await admin.from("messages").insert(
    recipients.map((r) => ({
      business_id: business.id,
      customer_id: r.id as string,
      to_phone: r.phone as string,
      kind: "broadcast",
      category: "marketing",   // the expensive category — the UI says so
      body: message,
      // Meta rejects a template whose body is nothing but a variable, so the
      // broadcast template is "Hello from {{1}}. {{2}}" — shop, then message.
      params: [business.name, message],
    }))
  );

  await admin.from("campaigns").insert({
    business_id: business.id,
    name: `Broadcast · ${new Date().toLocaleDateString("en-GB")}`,
    kind: "broadcast",
    audience: audience === "active" ? "all" : audience,
    message,
    active: false,
  });

  revalidatePath("/dashboard/campaigns");
}

/**
 * Record that the owner messaged someone by hand through a wa.me link.
 *
 * Nothing is sent from here — the owner's own phone does that. We log it so the
 * list doesn't keep offering the same person, and so there's a history. Channel
 * 'manual' keeps it out of every cost figure, because it costs nothing.
 */
export async function logManualOutreach(form: FormData) {
  const { business } = await requireBusiness();
  const admin = supabaseAdmin();
  const customerId = String(form.get("customer_id") ?? "");
  const body = String(form.get("body") ?? "").slice(0, 1000);
  if (!customerId) return;

  const { data: customer } = await admin
    .from("customers")
    .select("id, phone")
    .eq("id", customerId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!customer?.phone) return;

  await admin.from("messages").insert({
    business_id: business.id,
    customer_id: customer.id,
    to_phone: customer.phone,
    channel: "manual",
    kind: "broadcast",
    category: "service",
    status: "sent",
    sent_at: new Date().toISOString(),
    body,
  });

  revalidatePath("/dashboard/campaigns");
}
