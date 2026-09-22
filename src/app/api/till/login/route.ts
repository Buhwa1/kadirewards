import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signTillSession, setTillCookie } from "@/lib/till-session";

export async function POST(req: Request) {
  const { slug, pin, device_id } = await req.json().catch(() => ({}));
  if (!slug || !pin || !device_id) {
    return NextResponse.json({ error: "Shop, PIN and device are required." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: business } = await admin
    .from("businesses")
    .select("id, name, slug, currency, country, subscription_status")
    .eq("slug", String(slug).trim().toLowerCase())
    .maybeSingle();

  if (!business) return NextResponse.json({ error: "No shop with that code." }, { status: 404 });

  const { data: staff, error } = await admin.rpc("verify_staff_pin", {
    p_business: business.id,
    p_pin: String(pin),
  });

  if (error || !staff) {
    return NextResponse.json({ error: "PIN not recognised." }, { status: 401 });
  }

  const s = Array.isArray(staff) ? staff[0] : staff;

  await admin
    .from("till_devices")
    .upsert(
      { business_id: business.id, device_id: String(device_id), last_seen_at: new Date().toISOString() },
      { onConflict: "business_id,device_id" }
    );

  const token = await signTillSession({
    business_id: business.id,
    business_name: business.name,
    slug: business.slug,
    currency: business.currency,
    country: business.country,
    staff_id: s.id,
    staff_name: s.name,
    device_id: String(device_id),
  });
  await setTillCookie(token);

  return NextResponse.json({
    ok: true,
    business: { name: business.name, currency: business.currency, country: business.country },
    staff: { name: s.name },
  });
}
