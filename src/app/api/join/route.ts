import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { humanError } from "@/lib/format";

export async function POST(req: Request) {
  const { slug, phone, name, referral } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  const { data: business } = await admin
    .from("businesses")
    .select("id, country, subscription_status")
    .eq("slug", String(slug ?? "").toLowerCase())
    .maybeSingle();
  if (!business) return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  if (business.subscription_status === "canceled") {
    return NextResponse.json({ error: "This programme is not running." }, { status: 403 });
  }

  const e164 = normalizePhone(String(phone ?? ""), business.country);
  if (!e164) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });

  const { data, error } = await admin.rpc("resolve_customer", {
    p_business: business.id,
    p_identifier: e164,
    p_create: true,
    p_name: String(name ?? "").trim() || null,
    p_referral: String(referral ?? "").trim() || null,
  });

  if (error) return NextResponse.json({ error: humanError(error.message) }, { status: 400 });

  const c = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ card_url: `/c/${c.card_token}` });
}
