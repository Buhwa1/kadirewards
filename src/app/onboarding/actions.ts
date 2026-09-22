"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

export type OnboardState = { error?: string };

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "shop"
  );
}

export async function createBusiness(_prev: OnboardState, form: FormData): Promise<OnboardState> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(form.get("name") ?? "").trim();
  const category = String(form.get("category") ?? "").trim();
  const country = String(form.get("country") ?? "UG");
  const currency = String(form.get("currency") ?? "UGX");
  const phone = normalizePhone(String(form.get("phone") ?? ""), country);
  const type = String(form.get("type") ?? "points") as "points" | "stamps";
  const perThousand = Number(form.get("per_thousand") ?? 1);
  const stampsRequired = Number(form.get("stamps_required") ?? 10);
  const staffName = String(form.get("staff_name") ?? "Cashier").trim() || "Cashier";
  const pin = String(form.get("pin") ?? "").trim();

  if (!name) return { error: "What's the business called?" };
  if (!/^\d{4}$/.test(pin)) return { error: "The till PIN must be exactly 4 digits." };

  const admin = supabaseAdmin();

  // unique slug
  let slug = slugify(name);
  for (let i = 0; i < 25; i++) {
    const { data: taken } = await admin.from("businesses").select("id").eq("slug", slug).maybeSingle();
    if (!taken) break;
    slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 5)}`;
  }

  const { data: business, error: bErr } = await admin
    .from("businesses")
    .insert({ name, slug, category, country, currency, phone, timezone: "Africa/Kampala" })
    .select()
    .single();
  if (bErr || !business) return { error: bErr?.message ?? "Could not create the business." };

  const { error: mErr } = await admin
    .from("business_members")
    .insert({ business_id: business.id, user_id: user.id, role: "owner" });
  if (mErr) return { error: mErr.message };

  await admin.from("programs").insert({
    business_id: business.id,
    name: "Rewards",
    type,
    // "1 point per 1,000" entered by the owner becomes points_per_currency
    points_per_currency: perThousand / 1000,
    stamps_required: stampsRequired,
    welcome_bonus: type === "points" ? 20 : 0,
    birthday_bonus: type === "points" ? 50 : 0,
    referral_bonus_referrer: type === "points" ? 50 : 0,
    referral_bonus_referee: type === "points" ? 20 : 0,
  });

  await admin.from("tiers").insert([
    { business_id: business.id, name: "Bronze", min_points_lifetime: 0, multiplier: 1, color: "#B45309", sort: 0 },
    { business_id: business.id, name: "Silver", min_points_lifetime: 500, multiplier: 1.25, color: "#64748B", sort: 1 },
    { business_id: business.id, name: "Gold", min_points_lifetime: 2000, multiplier: 1.5, color: "#CA8A04", sort: 2 },
  ]);

  await admin.from("rewards").insert(
    type === "points"
      ? [
          { business_id: business.id, title: "Free drink", cost_points: 100, sort: 0 },
          { business_id: business.id, title: "10% off your bill", cost_points: 250, sort: 1 },
          { business_id: business.id, title: "Free item under UGX 20,000", cost_points: 500, sort: 2 },
        ]
      : [{ business_id: business.id, title: "One free on the house", cost_stamps: stampsRequired, sort: 0 }]
  );

  const { data: staff } = await admin
    .from("staff")
    .insert({ business_id: business.id, name: staffName })
    .select()
    .single();
  if (staff) await admin.rpc("set_staff_pin", { p_staff: staff.id, p_pin: pin });

  redirect("/dashboard");
}
