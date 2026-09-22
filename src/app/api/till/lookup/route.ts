import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readTillSession } from "@/lib/till-session";
import { humanError } from "@/lib/format";

export async function POST(req: Request) {
  const session = await readTillSession();
  if (!session) return NextResponse.json({ error: "Till locked." }, { status: 401 });

  const { identifier } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  const { data: customer, error } = await admin.rpc("resolve_customer", {
    p_business: session.business_id,
    p_identifier: String(identifier ?? ""),
    p_create: false,
  });

  if (error || !customer) {
    return NextResponse.json({ error: humanError(error?.message) }, { status: 404 });
  }

  const c = Array.isArray(customer) ? customer[0] : customer;

  const [{ data: rewards }, { data: tier }, { data: program }] = await Promise.all([
    admin
      .from("rewards")
      .select("*")
      .eq("business_id", session.business_id)
      .eq("active", true)
      .order("cost_points")
      .order("cost_stamps"),
    c.tier_id
      ? admin.from("tiers").select("*").eq("id", c.tier_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("programs")
      .select("type, stamps_required")
      .eq("business_id", session.business_id)
      .eq("active", true)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    customer: {
      id: c.id,
      name: c.name,
      phone: c.phone,
      card_code: c.card_code,
      points_balance: c.points_balance,
      stamps: c.stamps,
      visits: c.visits,
      blocked: c.blocked,
      last_visit_at: c.last_visit_at,
    },
    tier,
    program,
    rewards: rewards ?? [],
  });
}
